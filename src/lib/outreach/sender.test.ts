import { describe, expect, it } from "vitest";

import {
  detectConnectedMailProvider,
  OutreachSendError,
  sendApprovedDraftViaMailbox,
} from "@/lib/outreach/sender";

describe("outreach sender", () => {
  it("detects connected provider from app metadata", () => {
    expect(detectConnectedMailProvider({ providers: ["google"] })).toBe("google");
    expect(detectConnectedMailProvider({ providers: ["azure"] })).toBe("azure");
    expect(detectConnectedMailProvider({ providers: ["github"] })).toBeNull();
    expect(detectConnectedMailProvider(null)).toBeNull();
  });

  it("returns simulated send result by default mode", async () => {
    delete process.env.OUTREACH_SEND_MODE;

    const result = await sendApprovedDraftViaMailbox({
      provider: "google",
      providerToken: "token",
      fromEmail: "owner@firm.com",
      toEmail: "ceo@prospect.com",
      subject: "Quick intro",
      body: "Hi there, can we connect this week?",
    });

    expect(result.provider).toBe("google");
    expect(result.simulated).toBe(true);
    expect(result.messageId.startsWith("sim-")).toBe(true);
  });

  it("throws oauth_reauth_required when provider token is missing", async () => {
    await expect(
      sendApprovedDraftViaMailbox({
        provider: "google",
        providerToken: null,
        fromEmail: "owner@firm.com",
        toEmail: "ceo@prospect.com",
        subject: "Quick intro",
        body: "Hi there, can we connect this week?",
      }),
    ).rejects.toMatchObject({
      name: "OutreachSendError",
      code: "oauth_reauth_required",
      reauthRequired: true,
      status: 401,
    } satisfies Partial<OutreachSendError>);
  });
});
