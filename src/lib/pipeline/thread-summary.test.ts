import { describe, expect, it } from "vitest";

import { buildThreadSummaryFromEvents } from "@/lib/pipeline/thread-summary";

describe("buildThreadSummaryFromEvents", () => {
  it("combines and sorts outreach and mailbox events", () => {
    const summary = buildThreadSummaryFromEvents({
      outreachEvents: [
        {
          id: "o1",
          action_type: "sent",
          created_at: "2026-02-18T10:00:00.000Z",
          metadata: {
            provider: "google",
          },
        },
      ],
      mailboxEvents: [
        {
          id: "m1",
          event_type: "replied",
          event_occurred_at: "2026-02-18T12:00:00.000Z",
          payload: {
            prospect_email: "prospect@example.com",
          },
        },
      ],
    });

    expect(summary).toHaveLength(2);
    expect(summary[0]?.source).toBe("mailbox");
    expect(summary[1]?.source).toBe("outreach");
  });
});
