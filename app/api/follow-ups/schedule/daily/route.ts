import { apiError, apiSuccess } from "@/lib/api/response";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import {
  buildFollowUpSuggestion,
  computeNextFollowUpAt,
  isFollowUpEligible,
  type PipelineStage,
} from "@/lib/followup/rules";
import { logResearchEvent } from "@/lib/observability/telemetry";
import {
  isSchedulerAuthorized,
  resolveExpectedSchedulerToken,
} from "@/lib/scheduler/auth";
import { completeSchedulerRun, startSchedulerRun } from "@/lib/scheduler/runs";
import { toUtcDateKey } from "@/lib/scheduler/windows";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB_NAME = "followups_daily";

function clampInteger(input: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(input ?? "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function POST(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.FOLLOW_UP_SCHEDULER_TOKEN,
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    logResearchEvent("followup_scheduler_auth_failed", {
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
  const now = new Date();
  const nowIso = now.toISOString();
  const windowKey = toUtcDateKey(now);
  const batchLimit = clampInteger(process.env.FOLLOW_UP_SCHEDULER_BATCH_LIMIT, 25, 1, 100);
  const prospectLimit = clampInteger(process.env.FOLLOW_UP_SCHEDULER_PROSPECT_LIMIT, 50, 1, 200);

  const { data: firms, error: firmsError } = await admin
    .from("firms")
    .select("id")
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
  let createdTasks = 0;
  let skippedTasks = 0;

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
      windowKey,
      metadata: {
        scheduled_at: nowIso,
        prospect_limit: prospectLimit,
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

    try {
      const { data: prospects, error: prospectsError } = await admin
        .from("prospects")
        .select("id, company_name, primary_contact_name, pipeline_stage, next_follow_up_at")
        .eq("firm_id", firm.id)
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", nowIso)
        .order("next_follow_up_at", { ascending: true })
        .limit(prospectLimit);

      if (prospectsError) {
        throw new Error(prospectsError.message);
      }

      let firmCreated = 0;
      let firmSkipped = 0;

      for (const prospect of prospects ?? []) {
        const stage = prospect.pipeline_stage as PipelineStage;
        if (!isFollowUpEligible(stage)) {
          firmSkipped += 1;
          continue;
        }

        const suggestion = buildFollowUpSuggestion({
          companyName: prospect.company_name,
          stage,
          contactName: prospect.primary_contact_name,
        });

        const { error: insertError } = await admin.from("follow_up_tasks").insert({
          firm_id: firm.id,
          prospect_id: prospect.id,
          stage,
          due_at: prospect.next_follow_up_at,
          status: "pending",
          subject: suggestion.subject,
          body: suggestion.body,
          generated_by: "followup_rules_v1_daily",
          created_by: null,
        });

        if (insertError) {
          if (insertError.code === "23505") {
            firmSkipped += 1;
            continue;
          }

          throw new Error(insertError.message);
        }

        const nextFollowUpAt = computeNextFollowUpAt(stage, new Date(prospect.next_follow_up_at));
        const { error: updateError } = await admin
          .from("prospects")
          .update({ next_follow_up_at: nextFollowUpAt })
          .eq("id", prospect.id)
          .eq("firm_id", firm.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        firmCreated += 1;
      }

      processedFirms += 1;
      createdTasks += firmCreated;
      skippedTasks += firmSkipped;

      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "completed",
        metadata: {
          firm_created_tasks: firmCreated,
          firm_skipped_tasks: firmSkipped,
        },
      });

      results.push({
        firm_id: firm.id,
        status: "completed",
        created_tasks: firmCreated,
        skipped_tasks: firmSkipped,
      });
    } catch (error) {
      failedFirms += 1;
      const message = error instanceof Error ? error.message : "Unknown scheduler error";

      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "failed",
        errorMessage: message,
      });

      results.push({
        firm_id: firm.id,
        status: "failed",
        error: message,
      });
    }
  }

  return apiSuccess(request, {
    job_name: JOB_NAME,
    window_key: windowKey,
    scheduled_firms: firms?.length ?? 0,
    processed_firms: processedFirms,
    skipped_firms: skippedFirms,
    failed_firms: failedFirms,
    created_tasks: createdTasks,
    skipped_tasks: skippedTasks,
    results,
  });
}

export async function GET(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.FOLLOW_UP_SCHEDULER_TOKEN,
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
    .from("scheduler_runs")
    .select("id, firm_id, window_key, status, error_message, started_at, completed_at, metadata")
    .eq("job_name", JOB_NAME)
    .order("started_at", { ascending: false })
    .limit(30);

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

  const failedRuns = (recentRuns ?? []).filter((run) => run.status === "failed");

  return apiSuccess(request, {
    job_name: JOB_NAME,
    recent_count: recentRuns?.length ?? 0,
    failed_count: failedRuns.length,
    latest_run_at: recentRuns?.[0]?.started_at ?? null,
    failed_runs: failedRuns,
    recent_runs: recentRuns ?? [],
  });
}
