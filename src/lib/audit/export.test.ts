import { describe, expect, it } from "vitest";

import { recordsToCsv } from "@/lib/audit/export";

describe("audit export csv", () => {
  it("returns empty for no records", () => {
    expect(recordsToCsv([])).toBe("");
  });

  it("serializes rows with escaping", () => {
    const csv = recordsToCsv([
      {
        source: "agent_runs",
        status: "completed",
        details: { step: "research", count: 2 },
        notes: "line1\nline2",
      },
    ]);

    expect(csv).toContain("source,status,details,notes");
    expect(csv).toContain("agent_runs");
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"{""step"":""research"",""count"":2}"');
  });
});
