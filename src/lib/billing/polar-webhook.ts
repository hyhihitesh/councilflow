import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type AdminSupabase = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export type PolarWebhookEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

type ExtractedBillingFields = {
  firmId: string | null;
  polarCustomerId: string | null;
  externalCustomerId: string | null;
  polarSubscriptionId: string | null;
  productId: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function looksLikeHex(value: string) {
  return /^[a-fA-F0-9]+$/.test(value);
}

function verifyHmacSha256(payload: string, headerValue: string, secret: string) {
  const digestHex = createHmac("sha256", secret).update(payload).digest("hex");
  const digestBase64 = createHmac("sha256", secret).update(payload).digest("base64");

  const candidates = new Set<string>([
    digestHex,
    digestBase64,
    `sha256=${digestHex}`,
    `sha256=${digestBase64}`,
  ]);

  const provided = headerValue.trim();
  if (!provided) return false;

  for (const candidate of candidates) {
    const lhs = Buffer.from(candidate);
    const rhs = Buffer.from(provided);
    if (lhs.length !== rhs.length) continue;
    if (timingSafeEqual(lhs, rhs)) return true;
  }

  if (looksLikeHex(provided)) {
    const lhs = Buffer.from(digestHex);
    const rhs = Buffer.from(provided.toLowerCase());
    if (lhs.length === rhs.length && timingSafeEqual(lhs, rhs)) return true;
  }

  return false;
}

function normalizeSecretCandidates(secret: string) {
  const candidates = [secret];
  try {
    const decoded = Buffer.from(secret, "base64").toString("utf8");
    if (decoded && decoded !== secret) candidates.push(decoded);
  } catch {
    // no-op
  }
  return candidates;
}

function parseStandardWebhookSignatures(signatureHeader: string) {
  const tokens = signatureHeader
    .split(/[ ,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const signatures: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("v1,")) {
      signatures.push(token.slice(3));
      continue;
    }
    if (token.startsWith("v1=")) {
      signatures.push(token.slice(3));
      continue;
    }
    if (token.startsWith("v1:")) {
      signatures.push(token.slice(3));
      continue;
    }
  }

  if (signatures.length === 0 && signatureHeader.trim()) {
    signatures.push(signatureHeader.trim());
  }

  return signatures.filter(Boolean);
}

function verifyStandardWebhooksSignature(params: {
  payload: string;
  webhookId: string;
  webhookTimestamp: string;
  signatureHeader: string;
  secret: string;
}) {
  const { payload, webhookId, webhookTimestamp, signatureHeader, secret } = params;
  const signedPayload = `${webhookId}.${webhookTimestamp}.${payload}`;
  const signatures = parseStandardWebhookSignatures(signatureHeader);
  if (signatures.length === 0) return false;

  for (const secretCandidate of normalizeSecretCandidates(secret)) {
    const digestHex = createHmac("sha256", secretCandidate).update(signedPayload).digest("hex");
    const digestBase64 = createHmac("sha256", secretCandidate)
      .update(signedPayload)
      .digest("base64");
    const allowed = new Set<string>([
      digestHex,
      digestBase64,
      `v1,${digestHex}`,
      `v1,${digestBase64}`,
      `v1=${digestHex}`,
      `v1=${digestBase64}`,
    ]);

    for (const provided of signatures) {
      for (const candidate of allowed) {
        const lhs = Buffer.from(candidate);
        const rhs = Buffer.from(provided);
        if (lhs.length !== rhs.length) continue;
        if (timingSafeEqual(lhs, rhs)) return true;
      }
    }
  }

  return false;
}

export function verifyPolarWebhookSignature(params: {
  payload: string;
  headers: Headers;
  secret: string;
}) {
  const { payload, headers, secret } = params;

  const webhookId = headers.get("webhook-id");
  const webhookTimestamp = headers.get("webhook-timestamp");
  const webhookSignature = headers.get("webhook-signature");

  if (webhookId && webhookTimestamp && webhookSignature) {
    const verified = verifyStandardWebhooksSignature({
      payload,
      webhookId,
      webhookTimestamp,
      signatureHeader: webhookSignature,
      secret,
    });
    if (verified) return true;
  }

  const candidateHeaders = [
    headers.get("polar-signature"),
    headers.get("x-polar-signature"),
    headers.get("x-webhook-signature"),
  ].filter((value): value is string => Boolean(value?.trim()));

  if (candidateHeaders.length === 0) return false;
  return candidateHeaders.some((header) => verifyHmacSha256(payload, header, secret));
}

export function parsePolarWebhookEvent(rawPayload: string): PolarWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  const root = asRecord(parsed);
  if (!root) return null;

  const id =
    asString(root.id) ??
    asString(root.event_id) ??
    asString(asRecord(root.data)?.id) ??
    createHash("sha256").update(rawPayload).digest("hex");
  const type = asString(root.type) ?? asString(root.event_type) ?? "unknown";

  return {
    id,
    type,
    payload: root,
  };
}

function extractBillingFields(payload: Record<string, unknown>): ExtractedBillingFields {
  const data = asRecord(payload.data);
  const subscription = asRecord(data?.subscription) ?? data;
  const customer = asRecord(data?.customer);
  const metadata = asRecord(data?.metadata) ?? asRecord(customer?.metadata);

  const firmId =
    asString(payload.firm_id) ??
    asString(data?.firm_id) ??
    asString(subscription?.firm_id) ??
    asString(metadata?.firm_id);

  const polarCustomerId =
    asString(customer?.id) ??
    asString(data?.customer_id) ??
    asString(subscription?.customer_id) ??
    asString(payload.customer_id);

  const externalCustomerId =
    asString(customer?.external_id) ??
    asString(data?.external_customer_id) ??
    asString(payload.external_customer_id);

  const polarSubscriptionId =
    asString(subscription?.id) ??
    asString(data?.subscription_id) ??
    asString(payload.subscription_id);

  const productId =
    asString(subscription?.product_id) ??
    asString(asRecord(subscription?.product)?.id) ??
    asString(data?.product_id);

  const status = asString(subscription?.status) ?? asString(data?.status) ?? asString(payload.status);
  const currentPeriodEnd =
    asString(subscription?.current_period_end) ??
    asString(data?.current_period_end) ??
    asString(payload.current_period_end);

  const cancelAtPeriodEnd =
    asBoolean(subscription?.cancel_at_period_end) || asBoolean(data?.cancel_at_period_end);

  return {
    firmId,
    polarCustomerId,
    externalCustomerId,
    polarSubscriptionId,
    productId,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };
}

export async function persistPolarWebhookEvent(params: {
  supabase: AdminSupabase;
  event: PolarWebhookEvent;
  rawPayload: string;
}) {
  const { supabase, event, rawPayload } = params;
  const payloadHash = createHash("sha256").update(rawPayload).digest("hex");
  const fields = extractBillingFields(event.payload);

  const { error: insertEventError } = await supabase.from("billing_events").insert({
    firm_id: fields.firmId,
    event_id: event.id,
    event_type: event.type,
    payload: event.payload,
    payload_hash: payloadHash,
  });

  if (insertEventError) {
    if (insertEventError.code === "23505") {
      return {
        ok: true as const,
        duplicate: true,
      };
    }

    return {
      ok: false as const,
      statusCode: 500,
      error: insertEventError.message,
    };
  }

  if (fields.firmId && (fields.polarCustomerId || fields.externalCustomerId)) {
    const { error: customerError } = await supabase.from("billing_customers").upsert(
      {
        firm_id: fields.firmId,
        polar_customer_id: fields.polarCustomerId,
        external_customer_id: fields.externalCustomerId,
      },
      { onConflict: "firm_id" },
    );

    if (customerError) {
      return {
        ok: false as const,
        statusCode: 500,
        error: customerError.message,
      };
    }
  }

  if (fields.firmId && fields.polarSubscriptionId) {
    const { data: customer } = await supabase
      .from("billing_customers")
      .select("id")
      .eq("firm_id", fields.firmId)
      .maybeSingle();

    if (customer?.id) {
      const { error: subscriptionError } = await supabase.from("billing_subscriptions").upsert(
        {
          firm_id: fields.firmId,
          billing_customer_id: customer.id,
          polar_subscription_id: fields.polarSubscriptionId,
          product_id: fields.productId,
          status: fields.status ?? "unknown",
          current_period_end: fields.currentPeriodEnd,
          cancel_at_period_end: fields.cancelAtPeriodEnd,
          metadata: {
            event_type: event.type,
          },
        },
        { onConflict: "polar_subscription_id" },
      );

      if (subscriptionError) {
        return {
          ok: false as const,
          statusCode: 500,
          error: subscriptionError.message,
        };
      }
    }
  }

  const { error: processedError } = await supabase
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  if (processedError) {
    return {
      ok: false as const,
      statusCode: 500,
      error: processedError.message,
    };
  }

  return {
    ok: true as const,
    duplicate: false,
    fields,
  };
}
