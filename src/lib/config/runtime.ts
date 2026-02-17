import { hasRequiredBillingProductConfig } from "@/lib/billing/plans";

let validated = false;

function isTruthy(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function billingEnforcementEnabled() {
  if (isTruthy(process.env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS)) {
    return false;
  }

  const raw = process.env.BILLING_ENFORCEMENT_ENABLED;
  if (raw != null && raw.trim().length > 0) {
    return isTruthy(raw);
  }

  return (process.env.NODE_ENV ?? "development") === "production";
}

function assertEnvPresent(keys: string[]) {
  const missing = keys.filter((key) => {
    const value = process.env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function assertRuntimeConfig() {
  if (validated) return;

  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production") {
    validated = true;
    return;
  }

  if (billingEnforcementEnabled()) {
    assertEnvPresent(["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET"]);
    if (!hasRequiredBillingProductConfig()) {
      throw new Error(
        "Missing required billing product env vars: set POLAR_PRODUCT_STARTER/PRO/PREMIUM (legacy SOLO/FIRM/GROWTH is also supported).",
      );
    }
  }

  const reportingMode = (process.env.REPORTING_DELIVERY_MODE ?? "").trim().toLowerCase();
  if (reportingMode === "resend") {
    assertEnvPresent(["RESEND_API_KEY", "REPORTING_FROM_EMAIL", "REPORTING_DIGEST_RECIPIENTS"]);
  }

  validated = true;
}
