import Link from "next/link";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBillingPlanLabelByProductId } from "@/lib/billing/plans";

const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);

interface BillingSectionProps {
  firmId: string;
  isOwner: boolean;
}

export async function BillingSection({ firmId, isOwner }: BillingSectionProps) {
  const supabase = await createClient();

  const { data: billingSubscription } = await supabase
    .from("billing_subscriptions")
    .select("status, product_id, current_period_end, cancel_at_period_end, updated_at")
    .eq("firm_id", firmId)
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
  const billingStatusNormalized = (billingStatus ?? "").toLowerCase();
  const billingIsActive = ACTIVE_BILLING_STATUSES.has(billingStatusNormalized);

  const billingPlanLabel = getBillingPlanLabelByProductId(billingProductId);

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-[#F7F6F2]">
        <div>
          <h2 className="text-xl font-light tracking-tight">Billing & Subscription</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Enterprise workspace controls and firm-wide licensing.
          </p>
        </div>
        {isOwner ? (
          <Link
            href="/portal"
            className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
          >
            Billing Portal
          </Link>
        ) : (
          <span className="px-3 py-1 bg-[#EFECE5] text-[#A19D94] text-[10px] uppercase tracking-widest font-medium rounded">
            Owner Access Restricted
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4 stagger-children">
        <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Workspace Status</p>
          <p className={billingIsActive ? "text-lg font-medium text-[#6B705C] flex items-center gap-2" : "text-lg font-medium text-[#B79455]"}>
            {billingIsActive && <span className="w-1.5 h-1.5 rounded-full bg-[#6B705C] animate-pulse"></span>}
            {billingStatus ?? "inactive"}
          </p>
        </article>
        <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Current Tier</p>
          <p className="text-lg font-medium">{billingPlanLabel}</p>
        </article>
        <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Renewal Date</p>
          <p className="text-sm font-medium">
            {billingPeriodEnd ? new Date(billingPeriodEnd).toLocaleDateString() : "-"}
          </p>
        </article>
        <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Cycle Management</p>
          <p className="text-sm font-medium">
            {billingCancelAtPeriodEnd ? "Terminating at end" : "Active Auto-renew"}
          </p>
        </article>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {isOwner ? (
          <>
            {!billingIsActive ? (
              <>
                <Link
                  href="/checkout?plan=starter"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                >
                  Starter
                </Link>
                <Link
                  href="/checkout?plan=pro"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                >
                  Pro
                </Link>
                <Link
                  href="/checkout?plan=premium"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                >
                  Premium
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50/50 border border-emerald-100 rounded text-emerald-800 text-[11px] font-medium uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5" />
                Subscription active — Use portal for changes
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
