import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parseMailboxWebhookEvent,
  shouldMarkHotLead,
  toSignalStrength,
  verifyMailboxWebhookSignature,
} from "@/lib/mailbox/webhook";

describe("mailbox webhook", () => {
  it("verifies sha256 signature", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

    const headers = new Headers({
      "x-inhumans-signature": `sha256=${signature}`,
    });

    expect(
      verifyMailboxWebhookSignature({
        payload,
        headers,
        secret,
      }),
    ).toBe(true);
  });

  it("verifies legacy x-councilflow-signature header", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "test-secret";
    const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

    const headers = new Headers({
      "x-councilflow-signature": `sha256=${signature}`,
    });

    expect(
      verifyMailboxWebhookSignature({
        payload,
        headers,
        secret,
      }),
    ).toBe(true);
  });

  it("parses valid payload and computes hot lead rules", () => {
    const payload = JSON.stringify({
      provider: "generic",
      event_id: "evt_1",
      event_type: "opened",
      firm_id: "11111111-1111-1111-1111-111111111111",
      prospect_id: "22222222-2222-2222-2222-222222222222",
      occurred_at: "2026-02-17T10:00:00.000Z",
      metadata: {
        open_count: 3,
      },
    });

    const parsed = parseMailboxWebhookEvent(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.event_type).toBe("opened");
    expect(shouldMarkHotLead(parsed!)).toBe(true);
    expect(toSignalStrength(parsed!)).toBe(65);
  });

  it("marks replies as hot lead by default", () => {
    const payload = JSON.stringify({
      provider: "generic",
      event_id: "evt_2",
      event_type: "replied",
      firm_id: "11111111-1111-1111-1111-111111111111",
      prospect_email: "prospect@example.com",
    });

    const parsed = parseMailboxWebhookEvent(payload);
    expect(parsed).not.toBeNull();
    expect(shouldMarkHotLead(parsed!)).toBe(true);
    expect(toSignalStrength(parsed!)).toBe(90);
  });
});
