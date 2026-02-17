import { describe, expect, it } from "vitest";

import type { WeeklyReportingMetrics } from "@/lib/reporting/aggregate";
import { composeWeeklyDigest } from "@/lib/reporting/digest";

const metrics: WeeklyReportingMetrics = {
  generated: 20,
  approved: 10,
  sent: 8,
  dueFollowUps: 3,
  completedFollowUps: 5,
  publishedContent: 2,
  researchCompletedRuns: 4,
  researchFailedRuns: 1,
  stageCounts: {
    researched: 12,
    approved: 9,
    sent: 7,
    replied: 4,
    meeting: 2,
    won: 1,
    lost: 1,
  },
  funnel: {
    generated: 20,
    approved: 10,
    sent: 8,
    replied: 7,
    meeting: 3,
    won: 1,
    approvedRate: 50,
    sentRateFromApproved: 80,
    replyRateFromSent: 87.5,
    meetingRateFromSent: 37.5,
    winRateFromSent: 12.5,
  },
};

describe("composeWeeklyDigest", () => {
  it("builds digest with key sections", () => {
    const digest = composeWeeklyDigest({
      firmName: "inhumans.io",
      weekStart: "2026-02-09",
      weekEnd: "2026-02-15",
      generatedAt: "2026-02-16T10:00:00.000Z",
      metrics,
    });

    expect(digest.title).toBe("Weekly Digest (2026-02-09 to 2026-02-15)");
    expect(digest.summary).toContain("inhumans.io weekly digest");
    expect(digest.highlights.length).toBeGreaterThanOrEqual(4);
    expect(digest.risks.length).toBeGreaterThanOrEqual(2);
    expect(digest.week_start).toBe("2026-02-09");
    expect(digest.week_end).toBe("2026-02-15");
  });
});
