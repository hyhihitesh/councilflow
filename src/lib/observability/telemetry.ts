type TelemetryContext = Record<string, unknown>;

function isTelemetryEnabled() {
  const value = process.env.RESEARCH_TELEMETRY_ENABLED ?? "1";
  return value !== "0" && value.toLowerCase() !== "false";
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 280) return `${value.slice(0, 280)}...`;
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => redactValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, redactValue(entry)]),
    );
  }

  return value;
}

export function logResearchEvent(event: string, context: TelemetryContext = {}) {
  if (!isTelemetryEnabled()) return;

  const requestId =
    (typeof context.request_id === "string" ? context.request_id : null) ??
    (typeof context.requestId === "string" ? context.requestId : null) ??
    null;
  const tenantId =
    (typeof context.tenant_id === "string" ? context.tenant_id : null) ??
    (typeof context.firm_id === "string" ? context.firm_id : null) ??
    (typeof context.firmId === "string" ? context.firmId : null) ??
    null;
  const runId =
    (typeof context.run_id === "string" ? context.run_id : null) ??
    (typeof context.runId === "string" ? context.runId : null) ??
    null;

  const payload = {
    ts: new Date().toISOString(),
    event,
    request_id: requestId,
    tenant_id: tenantId,
    run_id: runId,
    context: redactValue(context),
  };

  console.log(JSON.stringify(payload));
}
