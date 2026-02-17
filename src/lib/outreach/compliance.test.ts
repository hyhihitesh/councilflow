import { describe, expect, it } from "vitest";

import { evaluateOutreachCompliance } from "@/lib/outreach/compliance";

describe("outreach compliance", () => {
  it("returns fail for guaranteed outcome language", () => {
    const result = evaluateOutreachCompliance({
      subject: "Quick intro",
      body: "We guarantee success for your matter and can always win this.",
      voiceScore: 80,
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((check) => check.id === "guaranteed_outcomes" && check.severity === "fail")).toBe(
      true,
    );
  });

  it("returns warning when no CTA is present", () => {
    const result = evaluateOutreachCompliance({
      subject: "Quick intro",
      body: "Sharing a concise approach that may help your in-house legal workflow.",
      voiceScore: 75,
    });

    expect(result.status).toBe("warning");
    expect(result.checks.some((check) => check.id === "cta_presence" && check.severity === "warning")).toBe(
      true,
    );
  });

  it("returns pass for healthy outreach draft", () => {
    const result = evaluateOutreachCompliance({
      subject: "Idea for your legal ops roadmap",
      body: "Hi team, we noticed your growth momentum and prepared a short legal-ops framework. Would a 15-minute chat next week be useful?",
      voiceScore: 84,
    });

    expect(result.status).toBe("pass");
  });
});
