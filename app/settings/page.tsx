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
      userEmail={user.email}
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
      headerActions={
        <>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Dashboard
          </Link>
        </>
      }
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {params.error ? <p className="mt-4 alert-error">{params.error}</p> : null}
        {params.message ? <p className="mt-4 alert-success">{params.message}</p> : null}

        <section className="mt-6 grid gap-6 md:grid-cols-2 stagger-children">
          <article className="bg-[#FDFCFB] border border-[#EBE8E0] p-8 shadow-sm rounded-sm">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Account</h2>
            <dl className="mt-6 grid gap-4 text-sm">
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <dt className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Display name</dt>
                <dd className="mt-1 text-[#2C2A26] font-medium">{profile?.display_name ?? "-"}</dd>
              </div>
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <dt className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Email</dt>
                <dd className="mt-1 text-[#2C2A26] font-medium">{user.email ?? "-"}</dd>
              </div>
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <dt className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Role</dt>
                <dd className="mt-1 text-[#2C2A26] font-medium capitalize">{primary.role}</dd>
              </div>
            </dl>
          </article>

          <article className="bg-[#FDFCFB] border border-[#EBE8E0] p-8 shadow-sm rounded-sm">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Integrations</h2>
            <div className="mt-6 grid gap-4 text-sm">
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Google</p>
                <p className={googleConnected ? "mt-1 font-medium text-emerald-700" : "mt-1 font-medium text-amber-700"}>
                  {googleConnected ? "Connected" : "Not connected"}
                </p>
                {!googleConnected ? (
                  <button
                    disabled
                    className="mt-3 px-3 py-1.5 border border-[#EBE8E0] text-[#A19D94] bg-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider cursor-not-allowed"
                  >
                    Connect Google (Coming Soon)
                  </button>
                ) : null}
              </div>
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Microsoft</p>
                <p className={microsoftConnected ? "mt-1 font-medium text-emerald-700" : "mt-1 font-medium text-amber-700"}>
                  {microsoftConnected ? "Connected" : "Not connected"}
                </p>
                {!microsoftConnected ? (
                  <button
                    disabled
                    className="mt-3 px-3 py-1.5 border border-[#EBE8E0] text-[#A19D94] bg-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider cursor-not-allowed"
                  >
                    Connect Microsoft (Coming Soon)
                  </button>
                ) : null}
              </div>
              <div className="rounded border border-[#EBE8E0] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Calendar sync</p>
                <p className="mt-1 font-medium text-emerald-700">Google: active</p>
                <p className="mt-1 font-medium text-amber-700">Outlook: deferred in this release</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-12 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Billing (Polar)</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Manage workspace subscription and owner-only billing actions.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Status</p>
              <p className={billingIsActive ? "mt-2 font-medium text-emerald-700" : "mt-2 font-medium text-amber-700"}>
                {billingStatus ?? "inactive"}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Plan</p>
              <p className="mt-2 font-medium text-[#2C2A26]">{billingPlanLabel}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Period end</p>
              <p className="mt-2 text-sm text-[#716E68] font-medium">{billingPeriodEnd ? new Date(billingPeriodEnd).toLocaleDateString() : "-"}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Auto-renew</p>
              <p className="mt-2 text-sm text-[#716E68] font-medium">{billingCancelAtPeriodEnd ? "Cancels at period end" : "On"}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Enforcement</p>
              <p className="mt-2 text-sm text-[#716E68] font-medium">
                {isBillingEnforcementEnabled() ? "Enforced" : "Bypassed (env override)"}
              </p>
            </article>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {isOwner ? (
              <>
                <Link
                  href="/portal"
                  className="px-6 py-3 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider shadow-sm"
                >
                  Open billing portal
                </Link>
                <Link
                  href="/checkout?plan=pro"
                  className="px-6 py-3 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 transition-all uppercase tracking-wider shadow-sm"
                >
                  Open checkout
                </Link>
              </>
            ) : (
              <span className="px-6 py-3 border border-[#EBE8E0] bg-[#FDFCFB] text-[#A19D94] text-[11px] font-medium rounded uppercase tracking-wider cursor-not-allowed">
                Owner access required for billing actions
              </span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
