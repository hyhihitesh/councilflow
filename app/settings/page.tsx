import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState, isBillingEnforcementEnabled } from "@/lib/billing/entitlements";
import { getBillingPlanLabelByProductId } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  message?: string;
};

const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id, role, firms(name)")
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const primary = memberships[0];
  const firm = Array.isArray(primary.firms) ? primary.firms[0] : primary.firms;
  const isOwner = primary.role === "owner";
  const accessState = await getFirmAccessState({
    supabase,
    firmId: primary.firm_id,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const oauthProviders = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : [];
  const googleConnected = oauthProviders.includes("google");
  const microsoftConnected = oauthProviders.includes("azure");

  const { data: billingSubscription } = await supabase
    .from("billing_subscriptions")
    .select("status, product_id, current_period_end, cancel_at_period_end, updated_at")
    .eq("firm_id", primary.firm_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const billingStatus =
    typeof billingSubscription?.status === "string" ? billingSubscription.status : null;
  const billingProductId =
    typeof billingSubscription?.product_id === "string" ? billingSubscription.product_id : null;
  const billingPeriodEnd =
    typeof billingSubscription?.current_period_end === "string"
      ? billingSubscription.current_period_end
      : null;
  const billingCancelAtPeriodEnd =
    typeof billingSubscription?.cancel_at_period_end === "boolean"
      ? billingSubscription.cancel_at_period_end
      : false;
  const billingIsActive = ACTIVE_BILLING_STATUSES.has((billingStatus ?? "").toLowerCase());

  const billingPlanLabel = getBillingPlanLabelByProductId(billingProductId);

  return (
    <AppShell
      title="Settings"
      description={`Firm: ${firm?.name ?? "Unknown"} | Workspace profile, integrations, and billing.`}
      billingAccessState={accessState.ok ? accessState.accessState : "active"}
      billingAccessContext={
        accessState.ok
          ? {
              trialEndsAt: accessState.trialEndsAt,
              graceEndsAt: accessState.graceEndsAt,
            }
          : undefined
      }
      currentPath="/settings"
      mobileCta={{ href: "/dashboard", label: "Open Command Center" }}
      headerActions={
        <>
          <Link
            href="/dashboard"
            className="rounded-md border border-white/20 bg-[#111827] px-3 py-2 text-xs"
          >
            Back to dashboard
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-white/20 bg-[#161B22] px-3 py-2 text-xs"
            >
              Sign out
            </button>
          </form>
        </>
      }
    >
      {params.error ? <p className="mt-6 alert-error">{params.error}</p> : null}
      {params.message ? <p className="mt-6 alert-success">{params.message}</p> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2 stagger-children">
        <article className="glass-card p-5">
          <h2 className="text-lg font-semibold">Account</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Display name</dt>
              <dd className="mt-1">{profile?.display_name ?? "-"}</dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Email</dt>
              <dd className="mt-1">{user.email ?? "-"}</dd>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <dt className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Role</dt>
              <dd className="mt-1 capitalize">{primary.role}</dd>
            </div>
          </dl>
        </article>

        <article className="glass-card p-5">
          <h2 className="text-lg font-semibold">Integrations</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Google</p>
              <p className={googleConnected ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
                {googleConnected ? "Connected" : "Not connected"}
              </p>
              {!googleConnected ? (
                <button
                  disabled
                  className="mt-2 inline-block rounded-md border border-white/20 bg-[#111827] px-2.5 py-1 text-xs text-[#CBD5E1] opacity-50 cursor-not-allowed"
                >
                  Connect Google (Coming Soon)
                </button>
              ) : null}
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Microsoft</p>
              <p className={microsoftConnected ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
                {microsoftConnected ? "Connected" : "Not connected"}
              </p>
              {!microsoftConnected ? (
                <button
                  disabled
                  className="mt-2 inline-block rounded-md border border-white/20 bg-[#111827] px-2.5 py-1 text-xs text-[#CBD5E1] opacity-50 cursor-not-allowed"
                >
                  Connect Microsoft (Coming Soon)
                </button>
              ) : null}
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Calendar sync</p>
              <p className="mt-1 text-emerald-200">Google: active</p>
              <p className="mt-1 text-amber-200">Outlook: deferred in this release</p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 glass-card p-5 reveal-up">
        <h2 className="text-lg font-semibold">Billing (Polar)</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Manage workspace subscription and owner-only billing actions.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Status</p>
            <p className={billingIsActive ? "mt-2 font-semibold text-emerald-200" : "mt-2 font-semibold text-amber-200"}>
              {billingStatus ?? "inactive"}
            </p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Plan</p>
            <p className="mt-2 font-semibold">{billingPlanLabel}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Period end</p>
            <p className="mt-2 text-sm">{billingPeriodEnd ? new Date(billingPeriodEnd).toLocaleDateString() : "-"}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Auto-renew</p>
            <p className="mt-2 text-sm">{billingCancelAtPeriodEnd ? "Cancels at period end" : "On"}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Enforcement</p>
            <p className="mt-2 text-sm">
              {isBillingEnforcementEnabled() ? "Enforced" : "Bypassed (env override)"}
            </p>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <Link
                href="/portal"
                className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200"
              >
                Open billing portal
              </Link>
              <Link
                href="/checkout?plan=pro"
                className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
              >
                Open checkout
              </Link>
            </>
          ) : (
            <span className="rounded-md border border-white/20 bg-[#0D1117] px-3 py-2 text-xs text-[#94A3B8]">
              Owner access required for billing actions
            </span>
          )}
        </div>
      </section>
    </AppShell>
  );
}
