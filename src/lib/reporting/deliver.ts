import type { SupabaseClient } from "@supabase/supabase-js";

import { logResearchEvent } from "@/lib/observability/telemetry";
import type { WeeklyDigestPayload } from "@/lib/reporting/digest";

export type ReportingDeliveryMode = "log" | "email_stub" | "resend";
export type ReportingDeliveryErrorCodeCount = {
  code: string;
  count: number;
};

export type WeeklyDigestDeliveryResult = {
  mode: ReportingDeliveryMode;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  maxAttemptObserved: number;
  maxAttemptsExhaustedCount: number;
  insertFailureCount: number;
  errorCodeCounts: ReportingDeliveryErrorCodeCount[];
  configIssue: string | null;
};

type ResendSendResult = {
  id: string;
};

type DeliveryAttemptResult = {
  ok: true;
  provider: string;
  providerMessageId: string | null;
} | {
  ok: false;
  provider: string;
  retryable: boolean;
  errorCode: string;
  errorMessage: string;
};

function parseRecipients(input: string | undefined) {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function resolveMode(value: string | undefined): ReportingDeliveryMode {
  const normalized = (value ?? "").trim().toLowerCase();
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const hasResendApiKey = Boolean(process.env.RESEND_API_KEY?.trim());

  if (normalized === "resend") return "resend";
  if (normalized === "email_stub" || normalized === "email") {
    if (isProduction) return hasResendApiKey ? "resend" : "log";
    return "email_stub";
  }
  if (normalized === "log") return "log";

  if (isProduction && hasResendApiKey) return "resend";
  return "log";
}

function getBackoffMs(attempt: number) {
  if (attempt <= 1) return 0;
  if (attempt === 2) return 30_000;
  return 120_000;
}

function getResendConfigIssue() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.REPORTING_FROM_EMAIL?.trim();
  if (!apiKey || !fromEmail) {
    return "RESEND_API_KEY and REPORTING_FROM_EMAIL are required for resend mode.";
  }
  return null;
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlFromDigest(payload: WeeklyDigestPayload) {
  const highlights = payload.highlights.map((item) => `<li>${item}</li>`).join("");
  const metrics = [
    `<li><strong>Generated drafts</strong>: ${payload.metrics.generated}</li>`,
    `<li><strong>Approved drafts</strong>: ${payload.metrics.approved}</li>`,
    `<li><strong>Sent outreach</strong>: ${payload.metrics.sent}</li>`,
    `<li><strong>Follow-ups due</strong>: ${payload.metrics.dueFollowUps}</li>`,
    `<li><strong>Follow-ups completed</strong>: ${payload.metrics.completedFollowUps}</li>`,
    `<li><strong>Published content</strong>: ${payload.metrics.publishedContent}</li>`,
    `<li><strong>Research runs (completed)</strong>: ${payload.metrics.researchCompletedRuns}</li>`,
    `<li><strong>Research runs (failed)</strong>: ${payload.metrics.researchFailedRuns}</li>`,
  ].join("");
  const risks = payload.risks.length
    ? `<h3>Risks</h3><ul>${payload.risks.map((item) => `<li>${item}</li>`).join("")}</ul>`
    : "";

  return `
    <h1>${payload.title}</h1>
    <p><strong>Week:</strong> ${payload.week_start} to ${payload.week_end}</p>
    <h3>Highlights</h3>
    <ul>${highlights}</ul>
    <h3>Metrics</h3>
    <ul>${metrics}</ul>
    ${risks}
  `.trim();
}

function textFromDigest(payload: WeeklyDigestPayload) {
  const lines = [
    payload.title,
    `Week: ${payload.week_start} to ${payload.week_end}`,
    "",
    "Highlights:",
    ...payload.highlights.map((item) => `- ${item}`),
    "",
    "Metrics:",
    `- Generated drafts: ${payload.metrics.generated}`,
    `- Approved drafts: ${payload.metrics.approved}`,
    `- Sent outreach: ${payload.metrics.sent}`,
    `- Follow-ups due: ${payload.metrics.dueFollowUps}`,
    `- Follow-ups completed: ${payload.metrics.completedFollowUps}`,
    `- Published content: ${payload.metrics.publishedContent}`,
    `- Research runs (completed): ${payload.metrics.researchCompletedRuns}`,
    `- Research runs (failed): ${payload.metrics.researchFailedRuns}`,
  ];

  if (payload.risks.length > 0) {
    lines.push("", "Risks:", ...payload.risks.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

async function sendViaResend(params: {
  recipient: string;
  payload: WeeklyDigestPayload;
}): Promise<DeliveryAttemptResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.REPORTING_FROM_EMAIL?.trim();
  const replyToEmail = process.env.REPORTING_REPLY_TO_EMAIL?.trim();

  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      provider: "resend",
      retryable: false,
      errorCode: "delivery_config_missing",
      errorMessage: "RESEND_API_KEY and REPORTING_FROM_EMAIL are required for resend mode.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.recipient],
        reply_to: replyToEmail,
        subject: params.payload.title,
        html: htmlFromDigest(params.payload),
        text: textFromDigest(params.payload),
      }),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 260);
      const retryable = response.status === 429 || response.status >= 500;
      return {
        ok: false,
        provider: "resend",
        retryable,
        errorCode: `resend_http_${response.status}`,
        errorMessage: `Resend request failed (${response.status}): ${text}`,
      };
    }

    const data = (await response.json()) as ResendSendResult;
    return {
      ok: true,
      provider: "resend",
      providerMessageId: data.id ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown resend request failure";
    return {
      ok: false,
      provider: "resend",
      retryable: true,
      errorCode: "resend_network_error",
      errorMessage: message,
    };
  }
}

async function deliverByMode(params: {
  mode: ReportingDeliveryMode;
  recipient: string;
  payload: WeeklyDigestPayload;
}): Promise<DeliveryAttemptResult> {
  if (params.mode === "log") {
    return {
      ok: true,
      provider: "internal",
      providerMessageId: null,
    };
  }

  if (params.mode === "email_stub") {
    return {
      ok: true,
      provider: "email_stub",
      providerMessageId: `stub-${Date.now()}`,
    };
  }

  return sendViaResend({
    recipient: params.recipient,
    payload: params.payload,
  });
}

export async function deliverWeeklyDigest(params: {
  supabase: SupabaseClient;
  firmId: string;
  reportingRunId: string;
  payload: WeeklyDigestPayload;
}): Promise<WeeklyDigestDeliveryResult> {
  const { supabase, firmId, reportingRunId, payload } = params;

  const mode = resolveMode(process.env.REPORTING_DELIVERY_MODE);
  const recipients =
    mode === "log"
      ? ["internal://dashboard"]
      : parseRecipients(process.env.REPORTING_DIGEST_RECIPIENTS);

  if (recipients.length === 0) {
    const { error } = await supabase.from("reporting_deliveries").insert({
      firm_id: firmId,
      reporting_run_id: reportingRunId,
      delivery_mode: mode,
      recipient: "unconfigured",
      status: "failed",
      provider: mode === "resend" ? "resend" : "internal",
      error_message: "No recipients configured for reporting delivery",
      last_error_code: "recipient_unconfigured",
      last_error_message: "No recipients configured for reporting delivery",
      attempt_count: 1,
      payload,
    });

    if (error) throw new Error(error.message);

    return {
      mode,
      sentCount: 0,
      failedCount: 1,
      totalRecipients: 0,
      maxAttemptObserved: 1,
      maxAttemptsExhaustedCount: 0,
      insertFailureCount: 0,
      errorCodeCounts: [{ code: "recipient_unconfigured", count: 1 }],
      configIssue: "No recipients configured for reporting delivery",
    };
  }

  const configIssue = mode === "resend" ? getResendConfigIssue() : null;
  if (configIssue) {
    for (const recipient of recipients) {
      await supabase.from("reporting_deliveries").insert({
        firm_id: firmId,
        reporting_run_id: reportingRunId,
        delivery_mode: mode,
        recipient,
        status: "failed",
        provider: "resend",
        error_message: configIssue,
        last_error_code: "delivery_config_missing",
        last_error_message: configIssue,
        attempt_count: 1,
        payload,
      });
    }

    return {
      mode,
      sentCount: 0,
      failedCount: recipients.length,
      totalRecipients: recipients.length,
      maxAttemptObserved: 1,
      maxAttemptsExhaustedCount: 0,
      insertFailureCount: 0,
      errorCodeCounts: [{ code: "delivery_config_missing", count: recipients.length }],
      configIssue,
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  let maxAttemptObserved = 0;
  let maxAttemptsExhaustedCount = 0;
  let insertFailureCount = 0;
  const errorCodeCounts = new Map<string, number>();

  for (const recipient of recipients) {
    const { data: inserted, error: insertError } = await supabase
      .from("reporting_deliveries")
      .insert({
        firm_id: firmId,
        reporting_run_id: reportingRunId,
        delivery_mode: mode,
        recipient,
        status: "queued",
        provider: mode === "resend" ? "resend" : mode === "email_stub" ? "email_stub" : "internal",
        payload,
        attempt_count: 1,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !inserted?.id) {
      failedCount += 1;
      insertFailureCount += 1;
      const code = "delivery_insert_failed";
      errorCodeCounts.set(code, (errorCodeCounts.get(code) ?? 0) + 1);
      logResearchEvent("reporting_delivery_insert_failed", {
        firm_id: firmId,
        reporting_run_id: reportingRunId,
        recipient,
        error: insertError?.message ?? "missing delivery id",
      });
      continue;
    }

    let attempt = 0;
    let delivered = false;
    let finalErrorCode: string | null = null;
    let finalErrorMessage: string | null = null;

    while (attempt < 3 && !delivered) {
      attempt += 1;
      maxAttemptObserved = Math.max(maxAttemptObserved, attempt);
      await delay(getBackoffMs(attempt));

      const attemptedAt = new Date().toISOString();
      const result = await deliverByMode({ mode, recipient, payload });

      if (result.ok) {
        await supabase
          .from("reporting_deliveries")
          .update({
            status: "sent",
            provider: result.provider,
            provider_message_id: result.providerMessageId,
            attempted_at: attemptedAt,
            attempt_count: attempt,
            error_message: null,
            last_error_code: null,
            last_error_message: null,
          })
          .eq("id", inserted.id)
          .eq("firm_id", firmId);

        logResearchEvent("reporting_delivery_success", {
          firm_id: firmId,
          reporting_run_id: reportingRunId,
          delivery_id: inserted.id,
          recipient,
          mode,
          provider: result.provider,
          attempt,
        });

        sentCount += 1;
        delivered = true;
      } else {
        finalErrorCode = result.errorCode;
        finalErrorMessage = result.errorMessage;
        errorCodeCounts.set(result.errorCode, (errorCodeCounts.get(result.errorCode) ?? 0) + 1);

        logResearchEvent("reporting_delivery_failure", {
          firm_id: firmId,
          reporting_run_id: reportingRunId,
          delivery_id: inserted.id,
          recipient,
          mode,
          provider: result.provider,
          attempt,
          retryable: result.retryable,
          error_code: result.errorCode,
          error: result.errorMessage,
        });

        await supabase
          .from("reporting_deliveries")
          .update({
            status: attempt >= 3 || !result.retryable ? "failed" : "queued",
            provider: result.provider,
            attempted_at: attemptedAt,
            attempt_count: attempt,
            error_message: result.errorMessage,
            last_error_code: result.errorCode,
            last_error_message: result.errorMessage,
          })
          .eq("id", inserted.id)
          .eq("firm_id", firmId);

        if (!result.retryable) {
          break;
        }
      }
    }

    if (!delivered) {
      failedCount += 1;
      if (attempt >= 3) {
        maxAttemptsExhaustedCount += 1;
      }
      logResearchEvent("reporting_delivery_exhausted", {
        firm_id: firmId,
        reporting_run_id: reportingRunId,
        delivery_id: inserted.id,
        recipient,
        mode,
        error_code: finalErrorCode,
        error: finalErrorMessage,
      });
    }
  }

  return {
    mode,
    sentCount,
    failedCount,
    totalRecipients: recipients.length,
    maxAttemptObserved,
    maxAttemptsExhaustedCount,
    insertFailureCount,
    errorCodeCounts: Array.from(errorCodeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => (b.count === a.count ? a.code.localeCompare(b.code) : b.count - a.count)),
    configIssue: null,
  };
}

export { parseRecipients, resolveMode };
