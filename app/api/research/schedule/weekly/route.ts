import { apiError, apiSuccess } from "@/lib/api/response";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { executeResearchRun } from "@/lib/research/run-executor";
import { isSchedulerAuthorized, resolveExpectedSchedulerToken } from "@/lib/scheduler/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    logResearchEvent("scheduler_auth_failed", {
      provided_token: Boolean(auth.providedToken),
    });
    return apiError(
      request,
      {
        code: "unauthorized_scheduler",
        message: "Scheduler token is invalid.",
      },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const batchLimit = Math.max(1, Math.min(100, Number(process.env.SCHEDULED_FIRM_BATCH_LIMIT ?? "25")));
  const prospectLimit = Math.max(
    1,
    Math.min(25, Number(process.env.SCHEDULED_PROSPECT_LIMIT_PER_FIRM ?? "10")),
  );

  const { data: firms, error: firmsError } = await admin
    .from("firms")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (firmsError) {
    logResearchEvent("scheduler_firm_query_failed", {
      error: firmsError.message,
    });
    return apiError(
      request,
      {
        code: "firm_query_failed",
        message: "Failed to load firms for scheduler.",
      },
      { status: 500 },
    );
  }

  logResearchEvent("scheduler_weekly_start", {
    firm_count: firms?.length ?? 0,
    batch_limit: batchLimit,
    prospect_limit: prospectLimit,
  });

  let started = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  const results: Array<Record<string, unknown>> = [];

  for (const firm of firms ?? []) {
    const result = await executeResearchRun({
      supabase: admin,
      firmId: firm.id,
      requestedBy: null,
      triggerType: "scheduled",
      limit: prospectLimit,
      maxRetryCount: 3,
    });

    if (!result.ok) {
      if (result.skippedBecauseRunning) {
        skipped += 1;
      } else {
        failed += 1;
      }
      results.push({
        firm_id: firm.id,
        status: "error",
        error: result.error,
      });
      continue;
    }

    started += 1;
    if (result.status === "completed") {
      completed += 1;
    } else {
      failed += 1;
    }

    results.push({
      firm_id: firm.id,
      status: result.status,
      run_id: result.runId,
      total_prospects: result.totalProspects,
      succeeded_prospects: result.succeededProspects,
    });
  }

  logResearchEvent("scheduler_weekly_finished", {
    scheduled_firms: firms?.length ?? 0,
    started_runs: started,
    completed_runs: completed,
    failed_runs: failed,
    skipped_running: skipped,
  });

  return apiSuccess(request, {
    scheduled_firms: firms?.length ?? 0,
    started_runs: started,
    completed_runs: completed,
    failed_runs: failed,
    skipped_running: skipped,
    results,
  });
}

export async function GET(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    logResearchEvent("scheduler_health_auth_failed", {
      provided_token: Boolean(auth.providedToken),
    });
    return apiError(
      request,
      {
        code: "unauthorized_scheduler",
        message: "Scheduler token is invalid.",
      },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  const { data: recentScheduledRuns, error } = await admin
    .from("research_runs")
    .select("id, firm_id, status, error_message, created_at, completed_at, run_summary")
    .eq("trigger_type", "scheduled")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return apiError(
      request,
      {
        code: "scheduler_health_query_failed",
        message: "Failed to load scheduler health.",
      },
      { status: 500 },
    );
  }

  const failedRuns = (recentScheduledRuns ?? []).filter((run) => run.status === "failed");

  return apiSuccess(request, {
    recent_count: recentScheduledRuns?.length ?? 0,
    failed_count: failedRuns.length,
    latest_run_at: recentScheduledRuns?.[0]?.created_at ?? null,
    failed_runs: failedRuns.map((run) => ({
      id: run.id,
      firm_id: run.firm_id,
      error_message: run.error_message,
      created_at: run.created_at,
    })),
    recent_runs: recentScheduledRuns ?? [],
  });
}
