import "server-only";
import { completeAgentRun, startAgentRun } from "@/lib/agent/audit";
import {
  buildResearchRunSummary,
  getRetryProspectIds,
  nextRetryCount,
} from "@/lib/research/orchestrator";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { Provider, runProviderEnrichment } from "@/lib/research/provider-runner";
import { computeProspectFitScore } from "@/lib/research/scoring";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type ExecuteResearchRunInput = {
  supabase: SupabaseLike;
  firmId: string;
  requestedBy?: string | null;
  retryRunId?: string;
  prospectId?: string;
  limit?: number;
  triggerType?: "manual" | "retry" | "scheduled";
  requireMemberUserId?: string;
  maxRetryCount?: number;
};

export type ExecuteResearchRunResult =
  | {
      ok: true;
      runId: string;
      status: "completed" | "failed";
      summary: Record<string, unknown>;
      totalProspects: number;
      succeededProspects: number;
      skippedBecauseRunning?: false;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      skippedBecauseRunning?: boolean;
    };

export async function executeResearchRun(input: ExecuteResearchRunInput): Promise<ExecuteResearchRunResult> {
  const {
    supabase,
    firmId,
    requestedBy = null,
    retryRunId = "",
    prospectId = "",
    limit = 10,
    triggerType: triggerInput,
    requireMemberUserId = "",
    maxRetryCount = 3,
  } = input;

  if (!firmId) {
    return { ok: false, statusCode: 400, error: "Missing firm_id" };
  }

  const runStartedAt = Date.now();
  const agentRunId = await startAgentRun({
    supabase,
    firmId,
    runType: "research_orchestrator",
    requestedBy,
    metadata: {
      trigger: triggerInput ?? "manual",
      retry_run_id: retryRunId || null,
      prospect_id: prospectId || null,
      limit,
    },
  });

  logResearchEvent("research_run_request", {
    firm_id: firmId,
    trigger: triggerInput ?? "manual",
    retry_run_id: retryRunId || null,
    prospect_id: prospectId || null,
    limit,
  });

  if (requireMemberUserId) {
    const { data: membership } = (await supabase
      .from("firm_memberships")
      .select("id")
      .eq("firm_id", firmId)
      .eq("user_id", requireMemberUserId)
      .maybeSingle()) as { data: { id: string } | null };

    if (!membership) {
      await completeAgentRun({
        supabase,
        firmId,
        runId: agentRunId,
        status: "failed",
        metadata: { error: "Access denied for research run" },
      });
      return { ok: false, statusCode: 403, error: "Access denied for research run" };
    }
  }

  const { data: runningRun } = (await supabase
    .from("research_runs")
    .select("id")
    .eq("firm_id", firmId)
    .eq("status", "running")
    .maybeSingle()) as { data: { id: string } | null };

  if (runningRun) {
    logResearchEvent("research_run_skipped_already_running", {
      firm_id: firmId,
      running_run_id: runningRun.id,
    });
    await completeAgentRun({
      supabase,
      firmId,
      runId: agentRunId,
      status: "canceled",
      metadata: { reason: "already_running", running_run_id: runningRun.id },
    });
    return {
      ok: false,
      statusCode: 409,
      error: "A research run is already in progress for this firm",
      skippedBecauseRunning: true,
    };
  }

  let triggerType: "manual" | "retry" | "scheduled" = triggerInput ?? "manual";
  let retryCount = 0;
  let retryProspectIds: string[] = [];

  if (retryRunId) {
    const { data: previousRun } = (await supabase
      .from("research_runs")
      .select("id, retry_count, run_summary")
      .eq("id", retryRunId)
      .eq("firm_id", firmId)
      .maybeSingle()) as {
      data: { id: string; retry_count: number | null; run_summary: unknown } | null;
    };

    if (!previousRun) {
      logResearchEvent("research_run_retry_source_missing", {
        firm_id: firmId,
        retry_run_id: retryRunId,
      });
      await completeAgentRun({
        supabase,
        firmId,
        runId: agentRunId,
        status: "failed",
        metadata: { error: "Retry source run not found", retry_run_id: retryRunId },
      });
      return { ok: false, statusCode: 404, error: "Retry source run not found" };
    }

    const nextCount = nextRetryCount(previousRun.retry_count);
    if (nextCount > maxRetryCount) {
      logResearchEvent("research_run_retry_limit_hit", {
        firm_id: firmId,
        retry_run_id: retryRunId,
        next_retry_count: nextCount,
        max_retry_count: maxRetryCount,
      });
      await completeAgentRun({
        supabase,
        firmId,
        runId: agentRunId,
        status: "failed",
        metadata: { error: "Retry limit reached", max_retry_count: maxRetryCount },
      });
      return {
        ok: false,
        statusCode: 400,
        error: `Retry limit reached (${maxRetryCount})`,
      };
    }

    triggerType = "retry";
    retryCount = nextCount;
    retryProspectIds = getRetryProspectIds(previousRun.run_summary as { failed_prospect_ids?: unknown });
  }

  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(25, limit)) : 10;
  let prospectQuery = supabase
    .from("prospects")
    .select("id, company_name, domain, primary_contact_title, status")
    .eq("firm_id", firmId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(boundedLimit);

  if (retryProspectIds.length > 0) {
    prospectQuery = prospectQuery.in("id", retryProspectIds);
  }

  if (prospectId) {
    prospectQuery = prospectQuery.eq("id", prospectId);
  }

  const { data: prospects, error: prospectError } = (await prospectQuery) as {
    data: Array<{
      id: string;
      company_name: string;
      domain: string | null;
      primary_contact_title: string | null;
      status: string;
    }> | null;
    error: { message: string } | null;
  };

  if (prospectError) {
    logResearchEvent("research_run_prospect_query_failed", {
      firm_id: firmId,
      error: prospectError.message,
    });
    await completeAgentRun({
      supabase,
      firmId,
      runId: agentRunId,
      status: "failed",
      metadata: { error: prospectError.message },
    });
    return { ok: false, statusCode: 500, error: prospectError.message };
  }

  if (!prospects || prospects.length === 0) {
    logResearchEvent("research_run_no_prospects", {
      firm_id: firmId,
      trigger: triggerType,
      prospect_id: prospectId || null,
    });
    await completeAgentRun({
      supabase,
      firmId,
      runId: agentRunId,
      status: "canceled",
      metadata: { reason: "no_prospects" },
    });
    return { ok: false, statusCode: 400, error: "No prospects available for research run" };
  }

  const { data: researchRun, error: runInsertError } = (await supabase
    .from("research_runs")
    .insert({
      firm_id: firmId,
      trigger_type: triggerType,
      status: "running",
      retry_count: retryCount,
      requested_by: requestedBy,
      started_at: new Date().toISOString(),
      run_summary: {
        total_prospects: prospects.length,
      },
    })
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (runInsertError || !researchRun) {
    logResearchEvent("research_run_insert_failed", {
      firm_id: firmId,
      error: runInsertError?.message,
    });
    await completeAgentRun({
      supabase,
      firmId,
      runId: agentRunId,
      status: "failed",
      metadata: { error: runInsertError?.message ?? "Failed to create research run" },
    });
    return {
      ok: false,
      statusCode: 500,
      error: runInsertError?.message ?? "Failed to create research run",
    };
  }

  const succeededProspects: string[] = [];
  const failedProspects: Array<{ prospect_id: string; error: string }> = [];
  let providerSuccessCount = 0;
  let providerFailureCount = 0;

  for (const prospect of prospects) {
    const providersToRun: Provider[] = ["exa_search", "exa_contents", "vibe"];
    
    const providerResults = await Promise.all(
      providersToRun.map((provider) =>
        runProviderEnrichment({
          supabase,
          provider,
          firmId,
          prospect,
          userId: requestedBy,
          agentRunId,
        }),
      ),
    );

    // Rate limiting: Wait 1s between prospects to avoid flooding APIs
    if (prospects.indexOf(prospect) < prospects.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const failedProvider = providerResults.find((result) => !result.success);
    if (failedProvider && !failedProvider.success) {
      failedProspects.push({
        prospect_id: prospect.id,
        error: failedProvider.error,
      });
    } else {
      succeededProspects.push(prospect.id);
    }

    providerSuccessCount += providerResults.filter((result) => result.success).length;
    providerFailureCount += providerResults.filter((result) => !result.success).length;

    const { data: signals } = (await supabase
      .from("prospect_signals")
      .select("signal_type, signal_source, signal_strength, summary, occurred_at")
      .eq("firm_id", firmId)
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: false })
      .limit(25)) as { data: unknown[] | null };

    const score = computeProspectFitScore(
      (signals ?? []) as Array<{
        signal_type: string | null;
        signal_source: string | null;
        signal_strength: number | null;
        summary: string | null;
        occurred_at: string | null;
      }>,
    );

    await supabase
      .from("prospects")
      .update({
        fit_score: score.fit_score,
        score_version: score.score_version,
        score_explanation: score.score_explanation,
        status: score.fit_score >= 65 ? "qualified" : "enriched",
      })
      .eq("id", prospect.id)
      .eq("firm_id", firmId);
  }

  const summary = buildResearchRunSummary({
    totalProspects: prospects.length,
    succeededProspects,
    failedProspects,
    providerSuccessCount,
    providerFailureCount,
  });

  const finalStatus = failedProspects.length > 0 ? "failed" : "completed";
  const completedAt = new Date().toISOString();

  await supabase
    .from("research_runs")
    .update({
      status: finalStatus,
      error_message: failedProspects.length ? `${failedProspects.length} prospect(s) failed` : null,
      run_summary: summary,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", researchRun.id)
    .eq("firm_id", firmId);

  logResearchEvent("research_run_finished", {
    firm_id: firmId,
    run_id: researchRun.id,
    status: finalStatus,
    trigger: triggerType,
    total_prospects: prospects.length,
    succeeded_prospects: succeededProspects.length,
    failed_prospects: failedProspects.length,
    provider_success_count: providerSuccessCount,
    provider_failure_count: providerFailureCount,
    duration_ms: Date.now() - runStartedAt,
  });

  await completeAgentRun({
    supabase,
    firmId,
    runId: agentRunId,
    status: finalStatus === "completed" ? "completed" : "failed",
    metadata: {
      run_id: researchRun.id,
      trigger: triggerType,
      total_prospects: prospects.length,
      succeeded_prospects: succeededProspects.length,
      failed_prospects: failedProspects.length,
      provider_success_count: providerSuccessCount,
      provider_failure_count: providerFailureCount,
    },
  });

  return {
    ok: true,
    runId: researchRun.id,
    status: finalStatus,
    summary,
    totalProspects: prospects.length,
    succeededProspects: succeededProspects.length,
  };
}
