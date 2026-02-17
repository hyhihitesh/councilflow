import { afterEach, describe, expect, it } from "vitest";

import { createCalendarEvent, detectCalendarProvider, normalizeCalendarAttendees } from "@/lib/calendar/service";

describe("calendar service", () => {
  const originalEnabled = process.env.CALENDAR_SYNC_ENABLED;

  afterEach(() => {
    process.env.CALENDAR_SYNC_ENABLED = originalEnabled;
  });

  it("detects google provider from app metadata", () => {
    expect(detectCalendarProvider({ providers: ["google"] })).toBe("google");
    expect(detectCalendarProvider({ providers: ["azure"] })).toBe("outlook");
    expect(detectCalendarProvider({ providers: ["email"] })).toBeNull();
  });

  it("normalizes attendees from comma string", () => {
    expect(normalizeCalendarAttendees("a@example.com, b@example.com ,, c@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("returns provider unavailable when calendar sync disabled", async () => {
    process.env.CALENDAR_SYNC_ENABLED = "0";

    await expect(
      createCalendarEvent({
        provider: "google",
        providerToken: "token",
        input: {
          title: "Demo",
          startsAt: "2026-02-18T10:00:00.000Z",
          endsAt: "2026-02-18T11:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({
      code: "calendar_provider_unavailable",
    });
  });

  it("requires oauth token", async () => {
    process.env.CALENDAR_SYNC_ENABLED = "1";

    await expect(
      createCalendarEvent({
        provider: "google",
        providerToken: null,
        input: {
          title: "Demo",
          startsAt: "2026-02-18T10:00:00.000Z",
          endsAt: "2026-02-18T11:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({
      code: "oauth_reauth_required",
    });
  });
});
