import { describe, expect, it } from "vitest";

import {
  buildProspectDedupKey,
  normalizeDomain,
  normalizeEmail,
  normalizeManualProspect,
} from "./ingest";

describe("prospect ingestion helpers", () => {
  it("normalizes domain from full url", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
  });

  it("normalizes email to lowercase", () => {
    expect(normalizeEmail(" Founder@Firm.COM ")).toBe("founder@firm.com");
  });

  it("builds dedupe key preferring domain over email", () => {
    expect(
      buildProspectDedupKey({
        company_name: "Acme",
        domain: "acme.com",
        primary_contact_email: "ceo@acme.com",
      }),
    ).toBe("domain:acme.com");
  });

  it("rejects record without company name", () => {
    const result = normalizeManualProspect({
      company_name: "",
      domain: "acme.com",
    });
    expect("error" in result && result.error).toBe("company_name is required");
  });

  it("rejects record missing both domain and contact email", () => {
    const result = normalizeManualProspect({
      company_name: "Acme",
    });
    expect("error" in result && result.error).toBe(
      "domain or primary_contact_email is required for dedupe",
    );
  });

  it("returns normalized prospect payload", () => {
    const result = normalizeManualProspect({
      company_name: "Acme Inc",
      domain: "www.acme.com",
      primary_contact_email: "CEO@acme.com",
      source: "Manual",
    });

    if (!("data" in result)) {
      throw new Error("expected data result");
    }

    expect(result.data).toMatchObject({
      company_name: "Acme Inc",
      domain: "acme.com",
      primary_contact_email: "ceo@acme.com",
      source: "manual",
    });
  });
});
