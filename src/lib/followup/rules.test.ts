import { describe, expect, it } from "vitest";

import {
  buildFollowUpSuggestion,
  computeNextFollowUpAt,
  isFollowUpEligible,
} from "@/lib/followup/rules";

describe("follow-up rules", () => {
  it("marks sent/replied/meeting as follow-up eligible", () => {
    expect(isFollowUpEligible("sent")).toBe(true);
    expect(isFollowUpEligible("replied")).toBe(true);
    expect(isFollowUpEligible("meeting")).toBe(true);
    expect(isFollowUpEligible("won")).toBe(false);
  });

  it("computes next follow-up for sent stage", () => {
    const base = new Date("2026-02-16T00:00:00.000Z");
    expect(computeNextFollowUpAt("sent", base)).toBe("2026-02-19T00:00:00.000Z");
  });

  it("returns no follow-up date for terminal stages", () => {
    const base = new Date("2026-02-16T00:00:00.000Z");
    expect(computeNextFollowUpAt("won", base)).toBeNull();
  });

  it("builds a usable suggestion payload", () => {
    const suggestion = buildFollowUpSuggestion({
      companyName: "Acme Legal",
      stage: "sent",
      contactName: "Riya",
    });

    expect(suggestion.subject).toContain("Acme Legal");
    expect(suggestion.body.length).toBeGreaterThan(30);
    expect(suggestion.body).toContain("Hi Riya");
  });
});
