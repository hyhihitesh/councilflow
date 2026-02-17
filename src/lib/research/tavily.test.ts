import { describe, expect, it } from "vitest";

import {
  buildTavilyQuery,
  mapTavilyResultsToSignals,
  type ProspectForTavily,
} from "./tavily";

describe("tavily helpers", () => {
  it("builds query with company and domain context", () => {
    const prospect: ProspectForTavily = {
      company_name: "Acme LegalTech",
      domain: "acme.com",
      primary_contact_title: "General Counsel",
    };

    const query = buildTavilyQuery(prospect);
    expect(query).toContain("Acme LegalTech");
    expect(query).toContain("domain:acme.com");
    expect(query).toContain("General Counsel");
  });

  it("maps tavily results into deduped signals", () => {
    const signals = mapTavilyResultsToSignals([
      {
        title: "Acme raises funding round",
        url: "https://news.example.com/acme-funding",
        content: "Acme raised Series B funding.",
        score: 0.91,
        published_date: "2026-02-01",
      },
      {
        title: "Acme raises funding round",
        url: "https://news.example.com/acme-funding",
        content: "Duplicate result should dedupe",
        score: 0.5,
      },
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.signal_type).toBe("funding_event");
    expect(signals[0]?.signal_strength).toBeGreaterThan(80);
    expect(signals[0]?.payload).toMatchObject({
      url: "https://news.example.com/acme-funding",
    });
  });
});
