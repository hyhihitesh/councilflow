export type BillingPlanKey = "starter" | "pro" | "premium";

const LEGACY_TO_CANONICAL: Record<string, BillingPlanKey> = {
  solo: "starter",
  firm: "pro",
  growth: "premium",
};

const CANONICAL_PLANS: BillingPlanKey[] = ["starter", "pro", "premium"];

type ProductEnvConfig = {
  canonical?: string;
  legacy?: string;
};

function readProductEnv(plan: BillingPlanKey): ProductEnvConfig {
  if (plan === "starter") {
    return {
      canonical: process.env.POLAR_PRODUCT_STARTER,
      legacy: process.env.POLAR_PRODUCT_SOLO,
    };
  }

  if (plan === "pro") {
    return {
      canonical: process.env.POLAR_PRODUCT_PRO,
      legacy: process.env.POLAR_PRODUCT_FIRM,
    };
  }

  return {
    canonical: process.env.POLAR_PRODUCT_PREMIUM,
    legacy: process.env.POLAR_PRODUCT_GROWTH,
  };
}

function normalize(raw: string | null | undefined) {
  return (raw ?? "").trim().toLowerCase();
}

export function resolveBillingPlan(raw: string | null): BillingPlanKey | null {
  const normalized = normalize(raw || "pro");
  if (normalized in LEGACY_TO_CANONICAL) {
    return LEGACY_TO_CANONICAL[normalized];
  }
  if (CANONICAL_PLANS.includes(normalized as BillingPlanKey)) {
    return normalized as BillingPlanKey;
  }
  return null;
}

export function getBillingPlanProductId(plan: BillingPlanKey) {
  const env = readProductEnv(plan);
  const canonical = env.canonical?.trim();
  if (canonical) return canonical;
  const legacy = env.legacy?.trim();
  return legacy || null;
}

export function getBillingPlanLabelByProductId(productId: string | null) {
  const normalized = productId?.trim();
  if (!normalized) return "None";

  for (const plan of CANONICAL_PLANS) {
    const env = readProductEnv(plan);
    if (normalized === env.canonical?.trim() || normalized === env.legacy?.trim()) {
      if (plan === "starter") return "Starter";
      if (plan === "pro") return "Pro";
      return "Premium";
    }
  }

  return "Custom";
}

export function hasRequiredBillingProductConfig() {
  return CANONICAL_PLANS.every((plan) => getBillingPlanProductId(plan));
}

