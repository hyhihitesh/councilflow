import { describe, expect, it } from "vitest";

import {
  extractSchedulerToken,
  isSchedulerAuthorized,
  resolveExpectedSchedulerToken,
} from "@/lib/scheduler/auth";

describe("scheduler auth", () => {
  it("extracts token from x-councilflow-scheduler-token header", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        "x-councilflow-scheduler-token": " header-token ",
      },
    });

    expect(extractSchedulerToken(request)).toBe("header-token");
  });

  it("extracts token from authorization bearer header", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        authorization: "Bearer bearer-token",
      },
    });

    expect(extractSchedulerToken(request)).toBe("bearer-token");
  });

  it("extracts token from query string", () => {
    const request = new Request("https://example.com/api/test?token=query-token");

    expect(extractSchedulerToken(request)).toBe("query-token");
  });

  it("resolves first non-empty expected token candidate", () => {
    expect(resolveExpectedSchedulerToken("", undefined, " fallback ")).toBe("fallback");
  });

  it("authorizes only when provided token matches expected token", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        authorization: "Bearer match-me",
      },
    });

    expect(isSchedulerAuthorized(request, "match-me")).toEqual({
      providedToken: "match-me",
      authorized: true,
    });

    expect(isSchedulerAuthorized(request, "different")).toEqual({
      providedToken: "match-me",
      authorized: false,
    });
  });
});
