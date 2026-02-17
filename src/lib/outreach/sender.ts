import { logResearchEvent } from "@/lib/observability/telemetry";
import { fetchWithTimeout } from "@/lib/research/http";

type Provider = "google" | "azure";

export type OutreachSendErrorCode =
  | "oauth_reauth_required"
  | "provider_rate_limited"
  | "provider_transient_failure"
  | "provider_rejected_request"
  | "unknown_send_failure";

export class OutreachSendError extends Error {
  code: OutreachSendErrorCode;
  status: number;
  reauthRequired: boolean;

  constructor(
    code: OutreachSendErrorCode,
    message: string,
    options?: {
      status?: number;
      reauthRequired?: boolean;
    },
  ) {
    super(message);
    this.name = "OutreachSendError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.reauthRequired = options?.reauthRequired ?? false;
  }
}

type SendInput = {
  provider: Provider;
  providerToken: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
};

export type SendResult = {
  provider: Provider;
  messageId: string;
  simulated: boolean;
};

function getSendMode() {
  return (process.env.OUTREACH_SEND_MODE ?? "simulate").toLowerCase();
}

function getSendTimeoutMs() {
  return Math.max(1000, Number(process.env.OUTREACH_SEND_TIMEOUT_MS ?? "12000"));
}

export function detectConnectedMailProvider(appMetadata: unknown): Provider | null {
  const value =
    appMetadata && typeof appMetadata === "object"
      ? (appMetadata as { providers?: unknown }).providers
      : null;
  const providers = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.toLowerCase())
    : [];

  if (providers.includes("google")) return "google";
  if (providers.includes("azure")) return "azure";
  return null;
}

function encodeBase64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function parseProviderErrorBody(response: Response) {
  const raw = await response.text();
  if (!raw) return "";

  try {
    const json = JSON.parse(raw) as {
      error?: { message?: string; code?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error === "object" && json.error.message) return json.error.message;
    if (json.message) return json.message;
  } catch {
    return raw.slice(0, 240);
  }

  return raw.slice(0, 240);
}

function mapProviderError(provider: Provider, status: number, detail: string) {
  const base = `${provider === "google" ? "Gmail" : "Microsoft"} send failed`;
  const safeDetail = detail ? `: ${detail.slice(0, 180)}` : "";

  if (status === 401 || status === 403) {
    return new OutreachSendError(
      "oauth_reauth_required",
      "Mailbox authorization expired or revoked. Reconnect Google/Microsoft and try again.",
      { status: 401, reauthRequired: true },
    );
  }

  if (status === 429) {
    return new OutreachSendError(
      "provider_rate_limited",
      `${base} due to provider rate limits${safeDetail}`,
      { status: 429 },
    );
  }

  if (status >= 500) {
    return new OutreachSendError(
      "provider_transient_failure",
      `${base} due to temporary provider failure${safeDetail}`,
      { status: 502 },
    );
  }

  return new OutreachSendError(
    "provider_rejected_request",
    `${base}${safeDetail}`,
    { status: 400 },
  );
}

async function sendViaGmail(input: SendInput) {
  const mime = [
    `To: ${input.toEmail}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\n");

  const response = await fetchWithTimeout(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.providerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        raw: encodeBase64Url(mime),
      }),
    },
    getSendTimeoutMs(),
  );

  if (!response.ok) {
    const detail = await parseProviderErrorBody(response);
    throw mapProviderError("google", response.status, detail);
  }

  const payload = (await response.json()) as { id?: string };
  return payload.id ?? `gmail-${Date.now()}`;
}

async function sendViaMicrosoft(input: SendInput) {
  const response = await fetchWithTimeout(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.providerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: "Text",
            content: input.body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: input.toEmail,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    },
    getSendTimeoutMs(),
  );

  if (response.status !== 202 && !response.ok) {
    const detail = await parseProviderErrorBody(response);
    throw mapProviderError("azure", response.status, detail);
  }

  return `graph-${Date.now()}`;
}

export async function sendApprovedDraftViaMailbox(input: SendInput): Promise<SendResult> {
  if (!input.providerToken) {
    throw new OutreachSendError(
      "oauth_reauth_required",
      "No provider access token found. Re-authenticate with Google or Microsoft.",
      { status: 401, reauthRequired: true },
    );
  }

  const mode = getSendMode();
  logResearchEvent("outreach_send_attempt", {
    provider: input.provider,
    mode,
    to_email_domain: input.toEmail.split("@")[1] ?? "unknown",
  });

  if (mode !== "live") {
    return {
      provider: input.provider,
      messageId: `sim-${Date.now()}`,
      simulated: true,
    };
  }

  try {
    const messageId = input.provider === "google" ? await sendViaGmail(input) : await sendViaMicrosoft(input);
    return {
      provider: input.provider,
      messageId,
      simulated: false,
    };
  } catch (error) {
    if (error instanceof OutreachSendError) throw error;

    if (error instanceof Error && error.message.includes("timed out")) {
      throw new OutreachSendError(
        "provider_transient_failure",
        "Mailbox provider request timed out. Retry in a moment.",
        { status: 504 },
      );
    }

    throw new OutreachSendError(
      "unknown_send_failure",
      "Unexpected mailbox send failure. Please retry or reconnect your provider.",
      { status: 500 },
    );
  }
}
