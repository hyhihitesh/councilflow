import type { SupabaseClient } from "@supabase/supabase-js";

type SchedulerRunStatus = "started" | "completed" | "failed" | "skipped";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

type SchedulerRunRecord = {
  id: string;
};

export async function startSchedulerRun(params: {
  supabase: SupabaseClient;
  jobName: string;
  firmId: string;
  windowKey: string;
  metadata?: JsonObject;
}) {
  const { supabase, jobName, firmId, windowKey, metadata = {} } = params;

  const { data, error } = await supabase
    .from("scheduler_runs")
    .insert({
      job_name: jobName,
      firm_id: firmId,
      window_key: windowKey,
      status: "started",
      metadata,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle<SchedulerRunRecord>();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false as const,
        duplicate: true as const,
        error,
      };
    }

    return {
      ok: false as const,
      duplicate: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    runId: data?.id ?? null,
  };
}

export async function completeSchedulerRun(params: {
  supabase: SupabaseClient;
  runId: string | null;
  status: Exclude<SchedulerRunStatus, "started">;
  metadata?: JsonObject;
  errorMessage?: string | null;
}) {
  const { supabase, runId, status, metadata, errorMessage = null } = params;
  if (!runId) return;

  const updatePayload: {
    status: Exclude<SchedulerRunStatus, "started">;
    completed_at: string;
    metadata?: JsonObject;
    error_message?: string;
  } = {
    status,
    completed_at: new Date().toISOString(),
  };

  if (metadata) {
    updatePayload.metadata = metadata;
  }

  if (errorMessage) {
    updatePayload.error_message = errorMessage;
  }

  await supabase
    .from("scheduler_runs")
    .update(updatePayload)
    .eq("id", runId);
}
