import { describe, expect, it } from "vitest";

import { generateContentDraft } from "@/lib/content/studio";

describe("content studio draft generation", () => {
  it("generates linkedin draft with hashtags", () => {
    const draft = generateContentDraft({ channel: "linkedin", topic: "pipeline visibility" });
    expect(draft.channel).toBe("linkedin");
    expect(draft.title).toContain("pipeline visibility");
    expect(draft.body).toContain("#LegalOps");
  });

  it("generates newsletter draft with section structure", () => {
    const draft = generateContentDraft({ channel: "newsletter", topic: "follow-up discipline" });
    expect(draft.channel).toBe("newsletter");
    expect(draft.body).toContain("What changed");
    expect(draft.body.length).toBeGreaterThan(120);
  });

  it("uses default topic fallback", () => {
    const draft = generateContentDraft({ channel: "linkedin" });
    expect(draft.title.toLowerCase()).toContain("business development");
  });
});
