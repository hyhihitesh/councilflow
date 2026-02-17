import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parsePolarWebhookEvent,
  persistPolarWebhookEvent,
  verifyPolarWebhookSignature,
} from "@/lib/billing/polar-webhook";

type AdminSupabase = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

describe("polar webhook", () => {
  it("verifies standard webhook signature format", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      type: "subscription.active",
      data: {
        subscription: {
          id: "sub_1",
          status: "active",
        },
      },
    });
    const secret = "whsec_test";
    const webhookId = "msg_123";
    const webhookTimestamp = "1700000000";
    const signedPayload = `${webhookId}.${webhookTimestamp}.${payload}`;
    const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");

    const headers = new Headers({
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": `v1=${signature}`,
    });

    expect(
      verifyPolarWebhookSignature({
        payload,
        headers,
        secret,
      }),
    ).toBe(true);
  });

  it("parses payload and falls back to deterministic id hash", () => {
    const payload = JSON.stringify({
      type: "subscription.canceled",
      data: {
        subscription: {
          id: "sub_9",
        },
      },
    });

    const event = parsePolarWebhookEvent(payload);
    expect(event).not.toBeNull();
    expect(event?.type).toBe("subscription.canceled");
    expect(event?.id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles replayed events idempotently", async () => {
    const seenEventIds = new Set<string>();

    const supabase = {
      from(table: string) {
        if (table === "billing_events") {
          return {
            insert: async (row: { event_id: string }) => {
              if (seenEventIds.has(row.event_id)) {
                return {
                  error: {
                    code: "23505",
                    message: "duplicate key value violates unique constraint",
                  },
                };
              }

              seenEventIds.add(row.event_id);
              return { error: null };
            },
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === "billing_customers") {
          return {
            upsert: async () => ({ error: null }),
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "customer_row_1" } }),
              }),
            }),
          };
        }

        if (table === "billing_subscriptions") {
          return {
            upsert: async () => ({ error: null }),
          };
        }

        throw new Error(`Unexpected table mock: ${table}`);
      },
    } as unknown as AdminSupabase;

    const rawPayload = JSON.stringify({
      id: "evt_replay_1",
      type: "subscription.active",
      data: {
        metadata: {
          firm_id: "11111111-1111-1111-1111-111111111111",
        },
        customer: {
          id: "cus_123",
          external_id: "ext_123",
        },
        subscription: {
          id: "sub_123",
          product_id: "prod_123",
          status: "active",
          current_period_end: "2026-03-01T00:00:00.000Z",
          cancel_at_period_end: false,
        },
      },
    });

    const event = parsePolarWebhookEvent(rawPayload);
    expect(event).not.toBeNull();

    const first = await persistPolarWebhookEvent({
      supabase,
      event: event!,
      rawPayload,
    });
    expect(first).toMatchObject({ ok: true, duplicate: false });

    const replay = await persistPolarWebhookEvent({
      supabase,
      event: event!,
      rawPayload,
    });
    expect(replay).toEqual({ ok: true, duplicate: true });
  });
});
