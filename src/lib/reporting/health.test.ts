import { describe, expect, it } from "vitest";

import { summarizeReportingObservability } from "@/lib/reporting/health";

describe("summarizeReportingObservability", () => {
  it("returns non-degraded defaults when no run exists", () => {
    const summary = summarizeReportingObservability({
      runs: [],
      deliveries: [],
    });

    expect(summary).toMatchObject({
      lastRunAt: null,
      lastRunId: null,
      latestRunFailed: false,
      sentCount: 0,
      failedCount: 0,
      maxAttemptsReachedCount: 0,
      configFailureCount: 0,
      actionHint: "No action required.",
      degraded: false,
    });
    expect(summary.topErrorCodes).toEqual([]);
  });

  it("uses only latest run deliveries and computes degraded metrics", () => {
    const summary = summarizeReportingObservability({
      runs: [
        { id: "run-new", status: "completed", created_at: "2026-02-17T10:00:00.000Z" },
        { id: "run-old", status: "failed", created_at: "2026-02-10T10:00:00.000Z" },
      ],
      deliveries: [
        { reporting_run_id: "run-new", status: "sent", last_error_code: null, attempt_count: 1 },
        {
          reporting_run_id: "run-new",
          status: "failed",
          last_error_code: "resend_http_429",
          attempt_count: 3,
        },
        {
          reporting_run_id: "run-new",
          status: "failed",
          last_error_code: "resend_http_429",
          attempt_count: 2,
        },
        { reporting_run_id: "run-old", status: "failed", last_error_code: "legacy", attempt_count: 3 },
      ],
    });

    expect(summary.sentCount).toBe(1);
    expect(summary.failedCount).toBe(2);
    expect(summary.maxAttemptsReachedCount).toBe(1);
    expect(summary.configFailureCount).toBe(0);
    expect(summary.actionHint).toBe("Check Resend limits/network and retry failed deliveries.");
    expect(summary.degraded).toBe(true);
    expect(summary.topErrorCodes).toEqual([{ code: "resend_http_429", count: 2 }]);
  });

  it("marks degraded when latest run failed even with no deliveries", () => {
    const summary = summarizeReportingObservability({
      runs: [{ id: "run-failed", status: "failed", created_at: "2026-02-17T12:00:00.000Z" }],
      deliveries: [],
    });

    expect(summary.latestRunFailed).toBe(true);
    expect(summary.degraded).toBe(true);
    expect(summary.actionHint).toBe("No action required.");
  });

  it("flags configuration failure as primary action", () => {
    const summary = summarizeReportingObservability({
      runs: [{ id: "run-config", status: "completed", created_at: "2026-02-17T12:00:00.000Z" }],
      deliveries: [
        {
          reporting_run_id: "run-config",
          status: "failed",
          last_error_code: "delivery_config_missing",
          attempt_count: 1,
        },
      ],
    });

    expect(summary.failedCount).toBe(1);
    expect(summary.configFailureCount).toBe(1);
    expect(summary.actionHint).toBe(
      "Configure REPORTING_DIGEST_RECIPIENTS, REPORTING_FROM_EMAIL, and RESEND_API_KEY.",
    );
  });
});
