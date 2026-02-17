import { apiError, apiSuccess } from "@/lib/api/response";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { logResearchEvent } from "@/lib/observability/telemetry";
import { aggregateWeeklyReportingMetrics } from "@/lib/reporting/aggregate";
import { deliverWeeklyDigest } from "@/lib/reporting/deliver";
import { composeWeeklyDigest } from "@/lib/reporting/digest";
import {
  isSchedulerAuthorized,
  resolveExpectedSchedulerToken,
} from "@/lib/scheduler/auth";
import { completeSchedulerRun, startSchedulerRun } from "@/lib/scheduler/runs";
import { toUtcDateKey, toUtcIsoWeekStartKey } from "@/lib/scheduler/windows";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB_NAME = "reporting_weekly_digest";

function clampInteger(input: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(input ?? "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildReportingWindow(now: Date) {
  const currentWeekStartIso = `${toUtcIsoWeekStartKey(now)}T00:00:00.000Z`;
  const currentWeekStart = new Date(currentWeekStartIso);

  const weekStart = new Date(currentWeekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return {
    weekStart,
    weekEnd,
    weekStartKey: toUtcDateKey(weekStart),
    weekEndKey: toUtcDateKey(weekEnd),
  };
}

export async function POST(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.REPORTING_SCHEDULER_TOKEN,
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    logResearchEvent("reporting_scheduler_auth_failed", {
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
  const batchLimit = clampInteger(process.env.REPORTING_SCHEDULER_BATCH_LIMIT, 25, 1, 100);
  const window = buildReportingWindow(new Date());

  const { data: firms, error: firmsError } = await admin
    .from("firms")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (firmsError) {
    return apiError(
      request,
      {
        code: "firm_query_failed",
        message: "Failed to load firms for scheduler.",
      },
      { status: 500 },
    );
  }

  let processedFirms = 0;
  let skippedFirms = 0;
  let failedFirms = 0;
  let completedRuns = 0;

  const results: Array<Record<string, unknown>> = [];

  for (const firm of firms ?? []) {
    const entitlement = await assertFirmEntitled({
      supabase: admin,
      firmId: firm.id,
    });

    if (!entitlement.ok) {
      skippedFirms += 1;
      results.push({
        firm_id: firm.id,
        status: "skipped",
        reason: entitlement.code,
      });
      continue;
    }

    const started = await startSchedulerRun({
      supabase: admin,
      jobName: JOB_NAME,
      firmId: firm.id,
      windowKey: window.weekStartKey,
      metadata: {
        week_start: window.weekStartKey,
        week_end: window.weekEndKey,
      },
    });

    if (!started.ok) {
      if (started.duplicate) {
        skippedFirms += 1;
        results.push({
          firm_id: firm.id,
          status: "skipped",
          reason: "already_processed_window",
        });
      } else {
        failedFirms += 1;
        results.push({
          firm_id: firm.id,
          status: "failed",
          reason: "run_marker_insert_failed",
          error: started.error.message,
        });
      }
      continue;
    }

    const { data: reportingRun, error: reportingRunError } = await admin
      .from("reporting_runs")
      .insert({
        firm_id: firm.id,
        week_start: window.weekStartKey,
        week_end: window.weekEndKey,
        status: "running",
        started_at: new Date().toISOString(),
        generated_by: "reporting_agent_v1",
        created_by: null,
      })
      .select("id")
      .maybeSingle();

    if (reportingRunError || !reportingRun?.id) {
      failedFirms += 1;
      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "failed",
        errorMessage: reportingRunError?.message ?? "Failed to create reporting run",
      });
      results.push({
        firm_id: firm.id,
        status: "failed",
        reason: "reporting_run_insert_failed",
        error: reportingRunError?.message ?? "missing reporting run id",
      });
      continue;
    }

    try {
      const metrics = await aggregateWeeklyReportingMetrics({
        supabase: admin,
        firmId: firm.id,
        sinceIso: window.weekStart.toISOString(),
        untilIso: window.weekEnd.toISOString(),
      });

      const digest = composeWeeklyDigest({
        firmName: firm.name ?? "Firm",
        weekStart: window.weekStartKey,
        weekEnd: window.weekEndKey,
        metrics,
      });

      const delivery = await deliverWeeklyDigest({
        supabase: admin,
        firmId: firm.id,
        reportingRunId: reportingRun.id,
        payload: digest,
      });

      if (delivery.sentCount === 0 && delivery.failedCount > 0) {
        throw new Error("Reporting delivery failed for all recipients.");
      }

      const { error: reportingRunUpdateError } = await admin
        .from("reporting_runs")
        .update({
          status: "completed",
          summary_title: digest.title,
          digest_payload: digest,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportingRun.id)
        .eq("firm_id", firm.id);

      if (reportingRunUpdateError) {
        throw new Error(reportingRunUpdateError.message);
      }

      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "completed",
        metadata: {
          reporting_run_id: reportingRun.id,
          deliveries_sent: delivery.sentCount,
          deliveries_failed: delivery.failedCount,
          deliveries_total: delivery.totalRecipients,
          max_attempt_observed: delivery.maxAttemptObserved,
          retries_exhausted: delivery.maxAttemptsExhaustedCount,
          delivery_insert_failures: delivery.insertFailureCount,
          delivery_error_codes: delivery.errorCodeCounts,
          delivery_config_issue: delivery.configIssue,
          delivery_mode: delivery.mode,
        },
      });

      processedFirms += 1;
      completedRuns += 1;
      results.push({
        firm_id: firm.id,
        status: "completed",
        reporting_run_id: reportingRun.id,
        sent_deliveries: delivery.sentCount,
        failed_deliveries: delivery.failedCount,
        retries_exhausted: delivery.maxAttemptsExhaustedCount,
        insert_failures: delivery.insertFailureCount,
        error_codes: delivery.errorCodeCounts,
        config_issue: delivery.configIssue,
      });
    } catch (error) {
      failedFirms += 1;
      const message = error instanceof Error ? error.message : "Unknown reporting scheduler error";

      await admin
        .from("reporting_runs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", reportingRun.id)
        .eq("firm_id", firm.id);

      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "failed",
        errorMessage: message,
      });

      results.push({
        firm_id: firm.id,
        status: "failed",
        reporting_run_id: reportingRun.id,
        error: message,
      });
    }
  }

  return apiSuccess(request, {
    job_name: JOB_NAME,
    week_start: window.weekStartKey,
    week_end: window.weekEndKey,
    scheduled_firms: firms?.length ?? 0,
    processed_firms: processedFirms,
    skipped_firms: skippedFirms,
    failed_firms: failedFirms,
    completed_runs: completedRuns,
    results,
  });
}

export async function GET(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.REPORTING_SCHEDULER_TOKEN,
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
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
  const { data: recentRuns, error } = await admin
    .from("reporting_runs")
    .select("id, firm_id, week_start, week_end, status, summary_title, error_message, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return apiError(
      request,
      {
        code: "scheduler_health_query_failed",
        message: "Failed to load reporting scheduler health.",
      },
      { status: 500 },
    );
  }

  const failedRuns = (recentRuns ?? []).filter((run) => run.status === "failed");

  return apiSuccess(request, {
    job_name: JOB_NAME,
    recent_count: recentRuns?.length ?? 0,
    failed_count: failedRuns.length,
    latest_run_at: recentRuns?.[0]?.created_at ?? null,
    failed_runs: failedRuns,
    recent_runs: recentRuns ?? [],
  });
}
