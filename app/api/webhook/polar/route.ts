import { apiError, apiSuccess } from "@/lib/api/response";
import {
  parsePolarWebhookEvent,
  persistPolarWebhookEvent,
  verifyPolarWebhookSignature,
} from "@/lib/billing/polar-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

function isSignatureVerificationEnabled() {
  const raw = (process.env.POLAR_WEBHOOK_VERIFY_SIGNATURE ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export async function POST(request: Request) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET ?? "";
  const rawPayload = await request.text();

  if (isSignatureVerificationEnabled()) {
    if (!webhookSecret) {
      return apiError(
        request,
        {
          code: "webhook_secret_missing",
          message: "POLAR_WEBHOOK_SECRET is not configured.",
        },
        { status: 500 },
      );
    }

    const isValid = verifyPolarWebhookSignature({
      payload: rawPayload,
      headers: request.headers,
      secret: webhookSecret,
    });

    if (!isValid) {
      return apiError(
        request,
        {
          code: "invalid_signature",
          message: "Webhook signature verification failed.",
        },
        { status: 401 },
      );
    }
  }

  const event = parsePolarWebhookEvent(rawPayload);
  if (!event) {
    return apiError(
      request,
      {
        code: "invalid_payload",
        message: "Invalid webhook payload.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const persisted = await persistPolarWebhookEvent({
    supabase: admin,
    event,
    rawPayload,
  });

  if (!persisted.ok) {
    return apiError(
      request,
      {
        code: "webhook_persist_failed",
        message: persisted.error,
      },
      { status: persisted.statusCode },
    );
  }

  return apiSuccess(request, {
    accepted: true,
    duplicate: persisted.duplicate,
    event_id: event.id,
    event_type: event.type,
  });
}
