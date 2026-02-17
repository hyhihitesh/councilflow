import { describe, expect, it } from "vitest";

import { computeProspectFitScore } from "./scoring";

describe("computeProspectFitScore", () => {
  it("returns low baseline score when no signals exist", () => {
    const score = computeProspectFitScore([]);
    expect(score.fit_score).toBe(12);
    expect(score.score_explanation[0]?.signal_type).toBe("none");
  });

  it("scores higher for stronger and recent funding signals", () => {
    const now = new Date().toISOString();
    const result = computeProspectFitScore([
      {
        signal_type: "funding_event",
        signal_source: "tavily",
        signal_strength: 90,
        summary: "Raised Series B",
        occurred_at: now,
      },
      {
        signal_type: "hiring_signal",
        signal_source: "firecrawl",
        signal_strength: 70,
        summary: "Hiring legal ops",
        occurred_at: now,
      },
    ]);

    expect(result.fit_score).toBeGreaterThan(35);
    expect(result.score_explanation.length).toBeGreaterThan(0);
    expect(result.score_version).toBe("v1");
  });
});
