import { describe, expect, it } from "vitest";

import {
  isAuthRoute,
  isProtectedRoute,
  isServerActionRequest,
} from "@/lib/supabase/middleware";

describe("supabase middleware path guards", () => {
  it("identifies auth sign-in route", () => {
    expect(isAuthRoute("/auth/sign-in")).toBe(true);
    expect(isAuthRoute("/auth/sign-in?error=test")).toBe(true);
    expect(isAuthRoute("/dashboard")).toBe(false);
  });

  it("protects sprint A and existing app routes", () => {
    const protectedPaths = [
      "/dashboard",
      "/prospects",
      "/onboarding",
      "/outreach",
      "/pipeline",
      "/content-studio",
      "/analytics",
      "/settings",
    ];

    protectedPaths.forEach((path) => {
      expect(isProtectedRoute(path)).toBe(true);
    });
  });

  it("does not protect public routes", () => {
    const publicPaths = ["/", "/auth/callback", "/favicon.ico", "/api/webhook/polar"];

    publicPaths.forEach((path) => {
      expect(isProtectedRoute(path)).toBe(false);
    });
  });

  it("detects Next.js server action requests", () => {
    expect(
      isServerActionRequest({
        method: "POST",
        headers: new Headers({ "next-action": "action-id" }),
      }),
    ).toBe(true);

    expect(
      isServerActionRequest({
        method: "GET",
        headers: new Headers({ "next-action": "action-id" }),
      }),
    ).toBe(false);

    expect(
      isServerActionRequest({
        method: "POST",
        headers: new Headers(),
      }),
    ).toBe(false);
  });
});
