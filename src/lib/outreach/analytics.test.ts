import { describe, expect, it } from "vitest";

import { summarizeOutreachEvents } from "@/lib/outreach/analytics";

describe("outreach analytics", () => {
  it("summarizes generated, approved, and sent totals", () => {
    const result = summarizeOutreachEvents([
      { action_type: "generated", created_at: "2026-02-16T10:00:00Z" },
      { action_type: "generated", created_at: "2026-02-16T10:10:00Z" },
      { action_type: "approved", created_at: "2026-02-16T10:12:00Z" },
      { action_type: "sent", created_at: "2026-02-16T10:15:00Z" },
      { action_type: "skipped", created_at: "2026-02-16T10:20:00Z" },
    ]);

    expect(result.generated).toBe(2);
    expect(result.approved).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.approvalRate).toBe(50);
    expect(result.sendRateFromApproved).toBe(100);
  });

  it("handles regenerated events as generated count", () => {
    const result = summarizeOutreachEvents([
      { action_type: "regenerated", created_at: "2026-02-16T10:00:00Z" },
      { action_type: "approved", created_at: "2026-02-16T10:10:00Z" },
    ]);

    expect(result.generated).toBe(1);
    expect(result.approvalRate).toBe(100);
  });
});
