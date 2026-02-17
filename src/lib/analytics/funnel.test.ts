import { describe, expect, it } from "vitest";

import { buildFunnelMetrics, toPercent } from "@/lib/analytics/funnel";

describe("funnel analytics", () => {
  it("computes stable percentages", () => {
    expect(toPercent(5, 10)).toBe(50);
    expect(toPercent(0, 0)).toBe(0);
  });

  it("builds funnel metrics from stage and event counts", () => {
    const result = buildFunnelMetrics({
      generated: 20,
      approved: 10,
      sent: 8,
      stageCounts: {
        researched: 30,
        approved: 6,
        sent: 5,
        replied: 2,
        meeting: 1,
        won: 1,
        lost: 3,
      },
    });

    expect(result.approvedRate).toBe(50);
    expect(result.sentRateFromApproved).toBe(80);
    expect(result.replyRateFromSent).toBe(50);
    expect(result.meetingRateFromSent).toBe(25);
    expect(result.winRateFromSent).toBe(12.5);
  });
});
