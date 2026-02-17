import { logResearchEvent } from "@/lib/observability/telemetry";
import { hasRequiredBillingProductConfig } from "@/lib/billing/plans";

type SupabaseLike = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

type BillingAccessState = "active" | "grace" | "read_only";
type BillingEnforcementMode = "bypassed" | "enforced";

export type EntitlementResult =
  | {
      ok: true;
      mode: BillingEnforcementMode;
      status: string | null;
      accessState: Exclude<BillingAccessState, "read_only">;
      emergencyBypass: boolean;
    }
  | {
      ok: false;
      code: "billing_query_failed" | "billing_inactive" | "trial_expired_read_only" | "billing_config_invalid";
      message: string;
      statusCode: number;
      details?: Record<string, unknown>;
    };

export type EntitlementFailure = Extract<EntitlementResult, { ok: false }>;

type AccessStateResult =
  | {
      ok: true;
      mode: BillingEnforcementMode;
      accessState: BillingAccessState;
      status: string | null;
      emergencyBypass: boolean;
      trialEndsAt: string | null;
      graceEndsAt: string | null;
      currentPeriodEnd: string | null;
    }
  | {
      ok: false;
      code: "billing_query_failed" | "billing_config_invalid";
      message: string;
      statusCode: number;
    };

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const TRIAL_ACCESS_STATES = new Set<BillingAccessState>(["active", "grace", "read_only"]);

function isTruthy(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isProduction() {
  return (process.env.NODE_ENV ?? "development") === "production";
}

export function isEmergencyBillingBypassEnabled() {
  return isTruthy(process.env.BILLING_ENFORCEMENT_EMERGENCY_BYPASS);
}

export function isBillingEnforcementEnabled() {
  if (isEmergencyBillingBypassEnabled()) return false;

  const raw = process.env.BILLING_ENFORCEMENT_ENABLED;
  if (raw != null && raw.trim().length > 0) {
    return isTruthy(raw);
  }

  return isProduction();
}

function hasRequiredProductionBillingConfig() {
  const required = [
    process.env.POLAR_ACCESS_TOKEN,
    process.env.POLAR_WEBHOOK_SECRET,
  ];

  const coreConfigured = required.every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return coreConfigured && hasRequiredBillingProductConfig();
}

function normalizeAccessState(value: string | null | undefined): BillingAccessState | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase() as BillingAccessState;
  return TRIAL_ACCESS_STATES.has(normalized) ? normalized : null;
}

function toTimestamp(value: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return ts;
}

export function isSubscriptionActive(status: string | null, currentPeriodEnd: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (!ACTIVE_STATUSES.has(normalized)) return false;
  if (!currentPeriodEnd) return true;
  const periodEndTs = Date.parse(currentPeriodEnd);
  if (Number.isNaN(periodEndTs)) return false;
  return periodEndTs > Date.now();
}

export function deriveAccessState(input: {
  status: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  accessState: string | null;
  now?: Date;
}): BillingAccessState {
  const nowTs = (input.now ?? new Date()).getTime();

  if (isSubscriptionActive(input.status, input.currentPeriodEnd)) {
    return "active";
  }

  const trialEndsTs = toTimestamp(input.trialEndsAt);
  const graceEndsTs = toTimestamp(input.graceEndsAt);

  if (trialEndsTs != null) {
    if (nowTs < trialEndsTs) return "active";
    if (graceEndsTs != null && nowTs < graceEndsTs) return "grace";
    return "read_only";
  }

  const explicit = normalizeAccessState(input.accessState);
  if (explicit) return explicit;

  return "read_only";
}

async function resolveFirmAccessState(params: {
  supabase: SupabaseLike;
  firmId: string;
}): Promise<AccessStateResult> {
  const { supabase, firmId } = params;

  const emergencyBypass = isEmergencyBillingBypassEnabled();
  const enforcementEnabled = isBillingEnforcementEnabled();

  if (emergencyBypass) {
    logResearchEvent("billing_enforcement_bypassed", {
      firm_id: firmId,
      node_env: process.env.NODE_ENV ?? "development",
    });
  }

  if (isProduction() && enforcementEnabled && !hasRequiredProductionBillingConfig()) {
    return {
      ok: false,
      code: "billing_config_invalid",
      message: "Billing configuration is incomplete for production enforcement.",
      statusCode: 500,
    };
  }

  if (!enforcementEnabled) {
    return {
      ok: true,
      mode: "bypassed",
      accessState: "active",
      status: null,
      emergencyBypass,
      trialEndsAt: null,
      graceEndsAt: null,
      currentPeriodEnd: null,
    };
  }

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("status, current_period_end, trial_ends_at, grace_ends_at, access_state, updated_at")
    .eq("firm_id", firmId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "billing_query_failed",
      message: "Failed to validate billing entitlement.",
      statusCode: 500,
    };
  }

  const status = typeof data?.status === "string" ? data.status : null;
  const currentPeriodEnd =
    typeof data?.current_period_end === "string" ? data.current_period_end : null;
  const trialEndsAt =
    typeof data?.trial_ends_at === "string" ? data.trial_ends_at : null;
  const graceEndsAt =
    typeof data?.grace_ends_at === "string" ? data.grace_ends_at : null;
  const accessStateRaw =
    typeof data?.access_state === "string" ? data.access_state : null;

  const accessState = deriveAccessState({
    status,
    currentPeriodEnd,
    trialEndsAt,
    graceEndsAt,
    accessState: accessStateRaw,
  });

  return {
    ok: true,
    mode: "enforced",
    accessState,
    status,
    emergencyBypass,
    trialEndsAt,
    graceEndsAt,
    currentPeriodEnd,
  };
}

export async function getFirmAccessState(params: {
  supabase: SupabaseLike;
  firmId: string;
}): Promise<AccessStateResult> {
  return resolveFirmAccessState(params);
}

export async function assertFirmEntitled(params: {
  supabase: SupabaseLike;
  firmId: string;
}): Promise<EntitlementResult> {
  const { firmId } = params;

  const resolved = await resolveFirmAccessState(params);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
      statusCode: resolved.statusCode,
    };
  }

  if (resolved.mode === "bypassed") {
    return {
      ok: true,
      mode: "bypassed",
      status: null,
      accessState: "active",
      emergencyBypass: resolved.emergencyBypass,
    };
  }

  if (resolved.accessState === "read_only") {
    return {
      ok: false,
      code: "trial_expired_read_only",
      message: "Workspace is read-only after trial expiration. Upgrade to resume write actions.",
      statusCode: 402,
      details: {
        firm_id: firmId,
        access_state: resolved.accessState,
        status: resolved.status,
        trial_ends_at: resolved.trialEndsAt,
        grace_ends_at: resolved.graceEndsAt,
      },
    };
  }

  if (!isSubscriptionActive(resolved.status, resolved.currentPeriodEnd) && resolved.accessState !== "grace") {
    return {
      ok: false,
      code: "billing_inactive",
      message: "Active subscription required to perform this action.",
      statusCode: 402,
      details: {
        status: resolved.status,
        current_period_end: resolved.currentPeriodEnd,
        access_state: resolved.accessState,
      },
    };
  }

  return {
    ok: true,
    mode: "enforced",
    status: resolved.status,
    accessState: resolved.accessState,
    emergencyBypass: resolved.emergencyBypass,
  };
}

export function toBillingBlockDetails(input: {
  accessState?: string | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  firmId?: string | null;
}) {
  return {
    access_state: input.accessState ?? null,
    trial_ends_at: input.trialEndsAt ?? null,
    grace_ends_at: input.graceEndsAt ?? null,
    status: input.status ?? null,
    current_period_end: input.currentPeriodEnd ?? null,
    firm_id: input.firmId ?? null,
  };
}
