import { describe, expect, it } from "vitest";

import { extractSignalsFromMarkdown } from "./firecrawl";

describe("firecrawl helpers", () => {
  it("extracts keyword-driven signals from markdown", () => {
    const markdown = `
Acme recently announced a major funding round to expand its legal operations team across two regions.
The company is hiring compliance counsel and security program managers to support growth.
Irrelevant short line.
`;

    const signals = extractSignalsFromMarkdown(markdown, "https://acme.com");
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]?.signal_source).toBe("firecrawl");
    expect(signals.some((signal) => signal.signal_type === "funding_event")).toBe(true);
  });

  it("dedupes repeated lines", () => {
    const line = "Acme is hiring compliance specialists for its enterprise security practice in 2026.";
    const markdown = `${line}\n${line}`;

    const signals = extractSignalsFromMarkdown(markdown, "https://acme.com");
    expect(signals).toHaveLength(1);
  });
});
