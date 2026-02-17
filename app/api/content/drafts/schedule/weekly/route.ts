import { apiError, apiSuccess } from "@/lib/api/response";
import { assertFirmEntitled } from "@/lib/billing/entitlements";
import { type ContentChannel, generateContentDraft } from "@/lib/content/studio";
import { logResearchEvent } from "@/lib/observability/telemetry";
import {
  isSchedulerAuthorized,
  resolveExpectedSchedulerToken,
} from "@/lib/scheduler/auth";
import { completeSchedulerRun, startSchedulerRun } from "@/lib/scheduler/runs";
import { isUtcWednesday, toUtcIsoWeekStartKey } from "@/lib/scheduler/windows";
import { createAdminClient } from "@/lib/supabase/admin";

const JOB_NAME = "content_weekly_wednesday";
const CHANNELS: ContentChannel[] = ["linkedin", "newsletter"];

function clampInteger(input: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(input ?? "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isTruthy(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function POST(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.CONTENT_SCHEDULER_TOKEN,
    process.env.RESEARCH_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    logResearchEvent("content_scheduler_auth_failed", {
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

  const now = new Date();
  const allowNonWednesday = isTruthy(process.env.CONTENT_SCHEDULER_ALLOW_NON_WEDNESDAY);
  if (!allowNonWednesday && !isUtcWednesday(now)) {
    return apiError(
      request,
      {
        code: "invalid_scheduler_day",
        message: "Weekly content scheduler runs only on Wednesday UTC.",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const windowKey = toUtcIsoWeekStartKey(now);
  const batchLimit = clampInteger(process.env.CONTENT_SCHEDULER_BATCH_LIMIT, 25, 1, 100);
  const topic = process.env.CONTENT_SCHEDULER_TOPIC?.trim() ?? "weekly business development insights";

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
  let createdDrafts = 0;
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
        scheduled_at: now.toISOString(),
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
      let firmDrafts = 0;

      for (const channel of CHANNELS) {
        const { data: latestVersion, error: latestError } = await admin
          .from("content_drafts")
          .select("version")
          .eq("firm_id", firm.id)
          .eq("channel", channel)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestError) {
          throw new Error(latestError.message);
        }

        const generated = generateContentDraft({
          channel,
          topic,
        });

        const { error: insertError } = await admin.from("content_drafts").insert({
          firm_id: firm.id,
          channel,
          status: "draft",
          title: generated.title,
          body: generated.body,
          topic,
          preview_payload: generated.preview_payload,
          generated_by: "content_scheduler_v1",
          version: (latestVersion?.version ?? 0) + 1,
          created_by: null,
        });

        if (insertError) {
          throw new Error(insertError.message);
        }

        firmDrafts += 1;
      }

      processedFirms += 1;
      createdDrafts += firmDrafts;

      await completeSchedulerRun({
        supabase: admin,
        runId: started.runId,
        status: "completed",
        metadata: {
          channels: CHANNELS,
          created_drafts: firmDrafts,
          topic,
        },
      });

      results.push({
        firm_id: firm.id,
        status: "completed",
        created_drafts: firmDrafts,
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
    created_drafts: createdDrafts,
    topic,
    results,
  });
}

export async function GET(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.CONTENT_SCHEDULER_TOKEN,
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
