import { describe, expect, it } from "vitest";

import {
  deriveAccessState,
  isBillingEnforcementEnabled,
  isEmergencyBillingBypassEnabled,
  isSubscriptionActive,
  toBillingBlockDetails,
} from "@/lib/billing/entitlements";

describe("billing entitlement helpers", () => {
  it("detects active subscription", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(isSubscriptionActive("active", future)).toBe(true);
    expect(isSubscriptionActive("trialing", null)).toBe(true);
    expect(isSubscriptionActive("active", past)).toBe(false);
    expect(isSubscriptionActive("canceled", future)).toBe(false);
  });

  it("derives trial and grace lifecycle states", () => {
    const now = new Date("2026-02-17T12:00:00.000Z");

    expect(
      deriveAccessState({
        status: "incomplete",
        currentPeriodEnd: null,
        trialEndsAt: "2026-02-18T00:00:00.000Z",
        graceEndsAt: "2026-02-20T00:00:00.000Z",
        accessState: null,
        now,
      }),
    ).toBe("active");

    expect(
      deriveAccessState({
        status: "incomplete",
        currentPeriodEnd: null,
        trialEndsAt: "2026-02-16T00:00:00.000Z",
        graceEndsAt: "2026-02-20T00:00:00.000Z",
        accessState: null,
        now,
      }),
    ).toBe("grace");

    expect(
      deriveAccessState({
        status: "incomplete",
        currentPeriodEnd: null,
        trialEndsAt: "2026-02-16T00:00:00.000Z",
        graceEndsAt: "2026-02-17T00:00:00.000Z",
        accessState: null,
        now,
      }),
    ).toBe("read_only");
  });

  it("uses emergency bypass and enforcement defaults", () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevEnforcement = process.env.BILLING_ENFORCEMENT_ENABLED;
    const prevBypass = process.env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS;

    env.NODE_ENV = "production";
    env.BILLING_ENFORCEMENT_ENABLED = "";
    env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS = "";

    expect(isEmergencyBillingBypassEnabled()).toBe(false);
    expect(isBillingEnforcementEnabled()).toBe(true);

    env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS = "1";
    expect(isEmergencyBillingBypassEnabled()).toBe(true);
    expect(isBillingEnforcementEnabled()).toBe(false);

    env.NODE_ENV = prevNodeEnv;
    env.BILLING_ENFORCEMENT_ENABLED = prevEnforcement;
    env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS = prevBypass;
  });

  it("normalizes billing block details payload", () => {
    expect(
      toBillingBlockDetails({
        accessState: "read_only",
        trialEndsAt: "2026-02-16T00:00:00.000Z",
      }),
    ).toEqual({
      access_state: "read_only",
      trial_ends_at: "2026-02-16T00:00:00.000Z",
      grace_ends_at: null,
      status: null,
      current_period_end: null,
      firm_id: null,
    });
  });
});
