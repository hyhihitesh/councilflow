type ReportingRunRecord = {
  id: string;
  status: string;
  created_at: string;
};

type ReportingDeliveryRecord = {
  reporting_run_id: string;
  status: string;
  last_error_code: string | null;
  attempt_count: number | null;
};

export type ReportingErrorCodeCount = {
  code: string;
  count: number;
};

export type ReportingObservabilitySummary = {
  lastRunAt: string | null;
  lastRunId: string | null;
  latestRunFailed: boolean;
  sentCount: number;
  failedCount: number;
  maxAttemptsReachedCount: number;
  configFailureCount: number;
  topErrorCodes: ReportingErrorCodeCount[];
  actionHint: string;
  degraded: boolean;
};

function normalizeErrorCode(input: string | null) {
  const trimmed = (input ?? "").trim();
  return trimmed.length > 0 ? trimmed : "unknown_error";
}

export function summarizeReportingObservability(params: {
  runs: ReportingRunRecord[] | null | undefined;
  deliveries: ReportingDeliveryRecord[] | null | undefined;
  topN?: number;
}): ReportingObservabilitySummary {
  const runs = params.runs ?? [];
  const deliveries = params.deliveries ?? [];
  const topN = Number.isFinite(params.topN) ? Math.max(1, Math.floor(params.topN ?? 3)) : 3;

  const latestRun = runs[0] ?? null;
  const latestRunId = latestRun?.id ?? null;
  const scopedDeliveries = latestRunId
    ? deliveries.filter((delivery) => delivery.reporting_run_id === latestRunId)
    : [];

  const sentCount = scopedDeliveries.filter((delivery) => delivery.status === "sent").length;
  const failedCount = scopedDeliveries.filter((delivery) => delivery.status === "failed").length;
  const maxAttemptsReachedCount = scopedDeliveries.filter(
    (delivery) => delivery.status === "failed" && (delivery.attempt_count ?? 0) >= 3,
  ).length;
  const configFailureCount = scopedDeliveries.filter((delivery) => {
    const code = normalizeErrorCode(delivery.last_error_code);
    return delivery.status === "failed" && (code === "delivery_config_missing" || code === "recipient_unconfigured");
  }).length;

  const errorBuckets = new Map<string, number>();
  for (const delivery of scopedDeliveries) {
    if (delivery.status !== "failed") continue;
    const code = normalizeErrorCode(delivery.last_error_code);
    errorBuckets.set(code, (errorBuckets.get(code) ?? 0) + 1);
  }

  const topErrorCodes = Array.from(errorBuckets.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (b.count === a.count ? a.code.localeCompare(b.code) : b.count - a.count))
    .slice(0, topN);

  const latestRunFailed = latestRun?.status === "failed";
  const actionHint = configFailureCount > 0
    ? "Configure REPORTING_DIGEST_RECIPIENTS, REPORTING_FROM_EMAIL, and RESEND_API_KEY."
    : maxAttemptsReachedCount > 0
      ? "Check Resend limits/network and retry failed deliveries."
      : failedCount > 0
        ? "Review last error codes and retry failed deliveries."
        : "No action required.";

  return {
    lastRunAt: latestRun?.created_at ?? null,
    lastRunId: latestRunId,
    latestRunFailed,
    sentCount,
    failedCount,
    maxAttemptsReachedCount,
    configFailureCount,
    topErrorCodes,
    actionHint,
    degraded: latestRunFailed || failedCount > 0,
  };
}
