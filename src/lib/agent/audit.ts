import { logResearchEvent } from "@/lib/observability/telemetry";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export async function startAgentRun(params: {
  supabase: SupabaseLike;
  firmId: string;
  runType: string;
  requestedBy?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, firmId, runType, requestedBy = null, correlationId = null, metadata = {} } = params;
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      firm_id: firmId,
      run_type: runType,
      status: "running",
      requested_by: requestedBy,
      correlation_id: correlationId,
      metadata,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    logResearchEvent("agent_run_start_failed", {
      firm_id: firmId,
      run_type: runType,
      error: error?.message ?? "unknown",
    });
    return null;
  }

  return data.id;
}

export async function completeAgentRun(params: {
  supabase: SupabaseLike;
  firmId: string;
  runId: string | null;
  status: "completed" | "failed" | "canceled";
  metadata?: Record<string, unknown>;
}) {
  const { supabase, firmId, runId, status, metadata } = params;
  if (!runId) return;

  const payload: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };

  if (metadata) payload.metadata = metadata;

  const { error } = await supabase
    .from("agent_runs")
    .update(payload)
    .eq("id", runId)
    .eq("firm_id", firmId);

  if (error) {
    logResearchEvent("agent_run_complete_failed", {
      firm_id: firmId,
      run_id: runId,
      status,
      error: error.message,
    });
  }
}

export async function startAgentStep(params: {
  supabase: SupabaseLike;
  firmId: string;
  runId: string | null;
  stepName: string;
  stepOrder?: number | null;
  inputPayload?: Record<string, unknown>;
}) {
  const { supabase, firmId, runId, stepName, stepOrder = null, inputPayload = {} } = params;
  if (!runId) return null;

  const { data, error } = await supabase
    .from("agent_steps")
    .insert({
      firm_id: firmId,
      run_id: runId,
      step_name: stepName,
      status: "running",
      step_order: stepOrder,
      input_payload: inputPayload,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    logResearchEvent("agent_step_start_failed", {
      firm_id: firmId,
      run_id: runId,
      step_name: stepName,
      error: error?.message ?? "unknown",
    });
    return null;
  }

  return data.id;
}

export async function completeAgentStep(params: {
  supabase: SupabaseLike;
  firmId: string;
  stepId: string | null;
  status: "completed" | "failed" | "skipped";
  outputPayload?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const { supabase, firmId, stepId, status, outputPayload, errorMessage = null } = params;
  if (!stepId) return;

  const payload: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };
  if (outputPayload) payload.output_payload = outputPayload;
  if (errorMessage) payload.error_message = errorMessage;

  const { error } = await supabase
    .from("agent_steps")
    .update(payload)
    .eq("id", stepId)
    .eq("firm_id", firmId);

  if (error) {
    logResearchEvent("agent_step_complete_failed", {
      firm_id: firmId,
      step_id: stepId,
      status,
      error: error.message,
    });
  }
}

export async function recordAgentToolCall(params: {
  supabase: SupabaseLike;
  firmId: string;
  runId: string | null;
  stepId?: string | null;
  toolName: string;
  status: "started" | "completed" | "failed";
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  durationMs?: number | null;
  errorMessage?: string | null;
}) {
  const {
    supabase,
    firmId,
    runId,
    stepId = null,
    toolName,
    status,
    requestPayload = {},
    responsePayload = {},
    durationMs = null,
    errorMessage = null,
  } = params;
  if (!runId) return;

  const { error } = await supabase.from("agent_tool_calls").insert({
    firm_id: firmId,
    run_id: runId,
    step_id: stepId,
    tool_name: toolName,
    status,
    request_payload: requestPayload,
    response_payload: responsePayload,
    duration_ms: durationMs,
    error_message: errorMessage,
  });

  if (error) {
    logResearchEvent("agent_tool_call_insert_failed", {
      firm_id: firmId,
      run_id: runId,
      tool_name: toolName,
      status,
      error: error.message,
    });
  }
}
