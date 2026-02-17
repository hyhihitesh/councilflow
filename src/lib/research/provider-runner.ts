import {
  completeAgentStep,
  recordAgentToolCall,
  startAgentStep,
} from "@/lib/agent/audit";
import { fetchFirecrawlCompanySignals } from "@/lib/research/firecrawl";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { fetchTavilyCompanySignals } from "@/lib/research/tavily";

export type ResearchProspect = {
  id: string;
  company_name: string;
  domain: string | null;
  primary_contact_title?: string | null;
};

type Provider = "tavily" | "firecrawl";

export async function runProviderEnrichment(params: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  provider: Provider;
  firmId: string;
  prospect: ResearchProspect;
  userId?: string | null;
  agentRunId?: string | null;
}) {
  const { supabase, provider, firmId, prospect, userId, agentRunId = null } = params;
  const runStart = Date.now();
  const agentStepId = await startAgentStep({
    supabase,
    firmId,
    runId: agentRunId,
    stepName: `research_provider_${provider}`,
    inputPayload: {
      prospect_id: prospect.id,
      company_name: prospect.company_name,
      domain: prospect.domain,
    },
  });

  await recordAgentToolCall({
    supabase,
    firmId,
    runId: agentRunId,
    stepId: agentStepId,
    toolName: provider,
    status: "started",
    requestPayload: {
      prospect_id: prospect.id,
    },
  });

  logResearchEvent("provider_run_start", {
    provider,
    firm_id: firmId,
    prospect_id: prospect.id,
  });

  const { data: run, error: runInsertError } = await supabase
    .from("prospect_enrichment_runs")
    .insert({
      firm_id: firmId,
      prospect_id: prospect.id,
      provider,
      status: "running",
      request_payload: {
        company_name: prospect.company_name,
        domain: prospect.domain,
      },
      created_by: userId ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runInsertError || !run) {
    logResearchEvent("provider_run_failed_to_start", {
      provider,
      firm_id: firmId,
      prospect_id: prospect.id,
      error: runInsertError?.message,
    });
    throw new Error(runInsertError?.message ?? `Failed to start ${provider} run`);
  }

  try {
    const enrichment =
      provider === "tavily"
        ? await fetchTavilyCompanySignals({
            company_name: prospect.company_name,
            domain: prospect.domain,
            primary_contact_title: prospect.primary_contact_title ?? null,
          })
        : await fetchFirecrawlCompanySignals({
            company_name: prospect.company_name,
            domain: prospect.domain,
          });

    if (enrichment.signals.length > 0) {
      const signalRows = enrichment.signals.map((signal) => ({
        firm_id: firmId,
        prospect_id: prospect.id,
        ...signal,
        created_by: userId ?? null,
      }));

      const { error: signalsInsertError } = await supabase
        .from("prospect_signals")
        .insert(signalRows);

      if (signalsInsertError) {
        throw new Error(signalsInsertError.message);
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - runStart;

    const { error: runUpdateError } = await supabase
      .from("prospect_enrichment_runs")
      .update({
        status: "completed",
        response_payload:
          provider === "tavily"
            ? {
                query: (enrichment as Awaited<ReturnType<typeof fetchTavilyCompanySignals>>).query,
                answer: (enrichment as Awaited<ReturnType<typeof fetchTavilyCompanySignals>>).answer,
                result_count:
                  (enrichment as Awaited<ReturnType<typeof fetchTavilyCompanySignals>>).result_count,
              }
            : {
                source_url:
                  (enrichment as Awaited<ReturnType<typeof fetchFirecrawlCompanySignals>>).source_url,
                signal_count:
                  (enrichment as Awaited<ReturnType<typeof fetchFirecrawlCompanySignals>>).signal_count,
              },
        duration_ms: durationMs,
        completed_at: completedAt,
      })
      .eq("id", run.id)
      .eq("firm_id", firmId);

    if (runUpdateError) {
      throw new Error(runUpdateError.message);
    }

    const { error: prospectUpdateError } = await supabase
      .from("prospects")
      .update({
        status: "enriched",
        last_activity_at: completedAt,
      })
      .eq("id", prospect.id)
      .eq("firm_id", firmId);

    if (prospectUpdateError) {
      throw new Error(prospectUpdateError.message);
    }

    logResearchEvent("provider_run_success", {
      provider,
      firm_id: firmId,
      prospect_id: prospect.id,
      run_id: run.id,
      signal_count: enrichment.signals.length,
      duration_ms: Date.now() - runStart,
    });

    await completeAgentStep({
      supabase,
      firmId,
      stepId: agentStepId,
      status: "completed",
      outputPayload: {
        prospect_id: prospect.id,
        signal_count: enrichment.signals.length,
      },
    });

    await recordAgentToolCall({
      supabase,
      firmId,
      runId: agentRunId,
      stepId: agentStepId,
      toolName: provider,
      status: "completed",
      durationMs: Date.now() - runStart,
      responsePayload: {
        run_id: run.id,
        signal_count: enrichment.signals.length,
      },
    });

    return {
      success: true as const,
      run_id: run.id,
      signal_count: enrichment.signals.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${provider} enrichment failed`;

    await supabase
      .from("prospect_enrichment_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - runStart,
      })
      .eq("id", run.id)
      .eq("firm_id", firmId);

    logResearchEvent("provider_run_error", {
      provider,
      firm_id: firmId,
      prospect_id: prospect.id,
      run_id: run.id,
      duration_ms: Date.now() - runStart,
      error: message,
    });

    await completeAgentStep({
      supabase,
      firmId,
      stepId: agentStepId,
      status: "failed",
      errorMessage: message,
      outputPayload: {
        prospect_id: prospect.id,
      },
    });

    await recordAgentToolCall({
      supabase,
      firmId,
      runId: agentRunId,
      stepId: agentStepId,
      toolName: provider,
      status: "failed",
      durationMs: Date.now() - runStart,
      errorMessage: message,
      responsePayload: {
        run_id: run.id,
      },
    });

    return {
      success: false as const,
      run_id: run.id,
      error: message,
    };
  }
}
