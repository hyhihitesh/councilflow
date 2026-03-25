
import { apiError, apiSuccess } from "@/lib/api/response";
import { computeNextFollowUpAt } from "@/lib/followup/rules";
import {
  parseMailboxWebhookEvent,
  shouldMarkHotLead,
  toSignalStrength,
  verifyMailboxWebhookSignature,
} from "@/lib/mailbox/webhook";
import { isSchedulerAuthorized, resolveExpectedSchedulerToken } from "@/lib/scheduler/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function isSignatureVerificationEnabled() {
  const raw = (process.env.MAILBOX_WEBHOOK_VERIFY_SIGNATURE ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export async function POST(request: Request) {
  const rawPayload = await request.text();
  const secret = process.env.MAILBOX_WEBHOOK_SECRET ?? "";

  const signatureVerified = isSignatureVerificationEnabled()
    ? verifyMailboxWebhookSignature({
        payload: rawPayload,
        headers: request.headers,
        secret,
      })
    : true;

  const admin = createAdminClient();

  if (!signatureVerified) {
    return apiError(
      request,
      {
        code: "invalid_signature",
        message: "Mailbox webhook signature verification failed.",
      },
      { status: 401 },
    );
  }

  const event = parseMailboxWebhookEvent(rawPayload);
  if (!event) {
    await admin.from("message_event_failures").insert({
      provider: null,
      error_code: "invalid_payload",
      error_message: "Mailbox webhook payload validation failed.",
      payload: rawPayload,
      signature_verified: signatureVerified,
    });

    return apiError(
      request,
      {
        code: "invalid_payload",
        message: "Mailbox webhook payload is invalid.",
      },
      { status: 400 },
    );
  }

  let prospectId = event.prospect_id ?? null;
  if (!prospectId && event.prospect_email) {
    const { data: prospectByEmail } = await admin
      .from("prospects")
      .select("id")
      .eq("firm_id", event.firm_id)
      .ilike("primary_contact_email", event.prospect_email)
      .limit(1)
      .maybeSingle();

    prospectId = prospectByEmail?.id ?? null;
  }

  const occurredAt = event.occurred_at ?? new Date().toISOString();

  const { data: insertedEvent, error: insertError } = await admin
    .from("message_events")
    .insert({
      firm_id: event.firm_id,
      prospect_id: prospectId,
      provider: event.provider,
      external_event_id: event.event_id,
      event_type: event.event_type,
      event_occurred_at: occurredAt,
      signature_verified: signatureVerified,
      payload: {
        prospect_email: event.prospect_email ?? null,
        metadata: event.metadata ?? {},
      },
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return apiSuccess(request, {
        accepted: true,
        duplicate: true,
        event_id: event.event_id,
        event_type: event.event_type,
      });
    }

    await admin.from("message_event_failures").insert({
      provider: event.provider,
      error_code: "event_insert_failed",
      error_message: insertError.message,
      payload: rawPayload,
      signature_verified: signatureVerified,
    });

    return apiError(
      request,
      {
        code: "event_insert_failed",
        message: insertError.message,
      },
      { status: 500 },
    );
  }

  if (!prospectId || !insertedEvent?.id) {
    await admin
      .from("message_events")
      .update({
        processed_at: new Date().toISOString(),
      })
      .eq("id", insertedEvent?.id ?? "");

    return apiSuccess(request, {
      accepted: true,
      duplicate: false,
      event_id: event.event_id,
      event_type: event.event_type,
      matched_prospect: false,
    });
  }

  const shouldHotLead = shouldMarkHotLead(event);
  const signalType = event.event_type === "replied" ? "reply" : "open";

  const baseProspectPatch: Record<string, unknown> = {
    last_activity_at: occurredAt,
  };

  if (event.event_type === "opened") {
    baseProspectPatch.last_opened_at = occurredAt;
  }

  if (event.event_type === "replied") {
    baseProspectPatch.last_replied_at = occurredAt;
    baseProspectPatch.last_contacted_at = occurredAt;
    baseProspectPatch.pipeline_stage = "replied";
    baseProspectPatch.next_follow_up_at = computeNextFollowUpAt("replied", new Date(occurredAt));
  }

  if (shouldHotLead) {
    baseProspectPatch.is_hot_lead = true;
    baseProspectPatch.hot_lead_reason = event.event_type === "replied" ? "reply_received" : "high_open_intent";
  }

  await admin
    .from("prospects")
    .update(baseProspectPatch)
    .eq("id", prospectId)
    .eq("firm_id", event.firm_id);

  await admin.from("prospect_signals").insert({
    firm_id: event.firm_id,
    prospect_id: prospectId,
    signal_type: signalType,
    signal_source: `mailbox_${event.provider}`,
    signal_strength: toSignalStrength(event),
    summary:
      event.event_type === "replied"
        ? "Prospect replied to outreach"
        : "Prospect opened outreach message",
    payload: {
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: occurredAt,
      metadata: event.metadata ?? {},
    },
    occurred_at: occurredAt,
    created_by: null,
  });

  await admin.from("follow_up_decision_signals").insert({
    firm_id: event.firm_id,
    prospect_id: prospectId,
    message_event_id: insertedEvent.id,
    signal_type: signalType,
    status: "queued",
    payload: {
      provider: event.provider,
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: occurredAt,
      should_mark_hot_lead: shouldHotLead,
    },
  });

  await admin
    .from("message_events")
    .update({
      processed_at: new Date().toISOString(),
    })
    .eq("id", insertedEvent.id)
    .eq("firm_id", event.firm_id);

  return apiSuccess(request, {
    accepted: true,
    duplicate: false,
    event_id: event.event_id,
    event_type: event.event_type,
    prospect_id: prospectId,
    hot_lead: shouldHotLead,
  });
}

export async function GET(request: Request) {
  const expectedToken = resolveExpectedSchedulerToken(
    process.env.MAILBOX_WEBHOOK_HEALTH_TOKEN,
    process.env.CRON_SECRET,
  );
  const auth = isSchedulerAuthorized(request, expectedToken);

  if (!auth.authorized) {
    return apiError(
      request,
      {
        code: "unauthorized",
        message: "Mailbox webhook health token is invalid.",
      },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const [eventsResult, failuresResult] = await Promise.all([
    admin
      .from("message_events")
      .select(
        "id, firm_id, prospect_id, provider, external_event_id, event_type, event_occurred_at, processed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("message_event_failures")
      .select("id, provider, error_code, error_message, signature_verified, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (eventsResult.error || failuresResult.error) {
    return apiError(
      request,
      {
        code: "mailbox_health_query_failed",
        message: eventsResult.error?.message ?? failuresResult.error?.message ?? "Query failed",
      },
      { status: 500 },
    );
  }

  return apiSuccess(request, {
    recent_events: eventsResult.data ?? [],
    recent_failures: failuresResult.data ?? [],
    processed_count: (eventsResult.data ?? []).filter((event) => Boolean(event.processed_at)).length,
    failure_count: failuresResult.data?.length ?? 0,
  });
}
