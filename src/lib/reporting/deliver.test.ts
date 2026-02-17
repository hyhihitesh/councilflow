import { describe, expect, it } from "vitest";

import { parseRecipients, resolveMode } from "@/lib/reporting/deliver";

describe("reporting delivery helpers", () => {
  it("parses comma-separated recipients", () => {
    expect(parseRecipients("a@example.com, b@example.com ,, c@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("normalizes explicit modes", () => {
    expect(resolveMode("log")).toBe("log");
    expect(resolveMode("email")).toBe("email_stub");
    expect(resolveMode("email_stub")).toBe("email_stub");
    expect(resolveMode("resend")).toBe("resend");
  });

  it("defaults by environment", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousResendKey = process.env.RESEND_API_KEY;

    env.NODE_ENV = "development";
    env.RESEND_API_KEY = "";
    expect(resolveMode(undefined)).toBe("log");

    env.NODE_ENV = "production";
    env.RESEND_API_KEY = "re_test_key";
    expect(resolveMode(undefined)).toBe("resend");

    env.NODE_ENV = previousNodeEnv;
    env.RESEND_API_KEY = previousResendKey;
  });
});
