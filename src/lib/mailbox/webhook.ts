import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const mailboxEventSchema = z.object({
  provider: z.enum(["gmail", "outlook", "generic"]),
  event_id: z.string().trim().min(1),
  event_type: z.enum(["opened", "replied"]),
  firm_id: z.string().uuid(),
  prospect_id: z.string().uuid().optional(),
  prospect_email: z.string().email().optional(),
  occurred_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type MailboxWebhookEvent = z.infer<typeof mailboxEventSchema>;

function toHexHmac(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeHexEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length === 0 || rightBuffer.length === 0) return false;
  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSignature(headerValue: string | null) {
  if (!headerValue) return "";
  const trimmed = headerValue.trim();
  if (!trimmed) return "";

  if (trimmed.toLowerCase().startsWith("sha256=")) {
    return trimmed.slice(7).trim();
  }

  return trimmed;
}

export function verifyMailboxWebhookSignature(params: {
  payload: string;
  headers: Headers;
  secret: string;
}) {
  const { payload, headers, secret } = params;
  const rawHeader =
    headers.get("x-inhumans-signature") ??
    headers.get("x-councilflow-signature") ??
    headers.get("x-mailbox-signature") ??
    headers.get("x-signature");

  const providedSignature = normalizeSignature(rawHeader);
  if (!providedSignature || !secret) return false;

  const expectedSignature = toHexHmac(payload, secret);
  return safeHexEqual(providedSignature, expectedSignature);
}

export function parseMailboxWebhookEvent(rawPayload: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  const result = mailboxEventSchema.safeParse(parsed);
  if (!result.success) return null;

  return result.data;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function shouldMarkHotLead(event: MailboxWebhookEvent) {
  if (event.event_type === "replied") return true;

  const openCount = toNumber(event.metadata?.open_count);
  const intentScore = toNumber(event.metadata?.intent_score);
  return openCount >= 3 || intentScore >= 70;
}

export function toSignalStrength(event: MailboxWebhookEvent) {
  if (event.event_type === "replied") return 90;

  const openCount = toNumber(event.metadata?.open_count);
  if (openCount >= 5) return 80;
  if (openCount >= 3) return 65;
  return 45;
}
