import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import {
  removeMemberAction,
  inviteMemberAction,
  resendInviteAction,
  revokeInviteAction,
  signOutAction,
  updateMemberRoleAction,
} from "@/app/auth/actions";
import { buildFunnelMetrics, type StageCounts } from "@/lib/analytics/funnel";
import { getBillingPlanLabelByProductId } from "@/lib/billing/plans";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { summarizeReportingObservability } from "@/lib/reporting/health";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import { ZenToggle } from "@/components/dashboard/zen-toggle";
import { Zap, ChevronRight, Users } from "lucide-react";

type SearchParams = {
  error?: string;
  message?: string;
  q?: string;
  status?: string;
  min_score?: string;
  zen?: string;
};

const PIPELINE_STAGES = [
  "researched",
  "approved",
  "sent",
  "replied",
  "meeting",
  "won",
  "lost",
] as const;

const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase, user, firmId, role, firmName } = await requireAuth();

  const accessState = await getFirmAccessState({ supabase, firmId });
  const isOwner = role === "owner";
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.status?.trim().toLowerCase() ?? "all";
  const minScore = Number(params.min_score ?? "");
  const hasMinScore = Number.isFinite(minScore) && minScore >= 0;
  const isZen = params.zen === "true";
  const firm = firmName ? { name: firmName } : null;

  // Build filtered prospects query based on search params
  let prospectsQuery = supabase
    .from("prospects")
    .select("id, company_name, domain, status, fit_score, score_explanation, created_at")
    .eq("firm_id", firmId);
  if (searchQuery) prospectsQuery = prospectsQuery.or(`company_name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%`);
  if (statusFilter && statusFilter !== "all") prospectsQuery = prospectsQuery.eq("status", statusFilter);
  if (hasMinScore) prospectsQuery = prospectsQuery.gte("fit_score", minScore);

  // Parallel fetch: all independent queries in one round-trip
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const [
    { data: firmMembers },
    { data: invitations },
    { data: prospects },
    { data: researchRuns },
  ] = await Promise.all([
    supabase
      .from("firm_memberships")
      .select("id, user_id, role, created_at")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: true }),
    supabase
      .from("firm_invitations")
      .select("id, email, role, status, invited_at, expires_at")
      .eq("firm_id", firmId)
      .order("invited_at", { ascending: false })
      .limit(20),
    prospectsQuery
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("research_runs")
      .select("id, trigger_type, status, retry_count, run_summary, error_message, created_at")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const memberIds = (firmMembers ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
    : { data: [] };
  const profileMap = new Map((memberProfiles ?? []).map((p) => [p.id, p.display_name]));

  const scheduledRuns = (researchRuns ?? []).filter((run) => run.trigger_type === "scheduled");
  const scheduledFailedCount = scheduledRuns.filter((run) => run.status === "failed").length;
  const latestScheduledRun = scheduledRuns[0];

  const { data: reportingRuns } = await supabase
    .from("reporting_runs")
    .select("id, status, week_start, week_end, summary_title, error_message, created_at, completed_at")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(10);

  const reportingRunIds = (reportingRuns ?? []).map((run) => run.id);
  const { data: reportingDeliveries } = reportingRunIds.length
    ? await supabase
        .from("reporting_deliveries")
        .select(
          "id, reporting_run_id, delivery_mode, recipient, status, error_message, created_at, attempted_at, attempt_count, last_error_code, last_error_message",
        )
        .eq("firm_id", firmId)
        .in("reporting_run_id", reportingRunIds)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const reportingObservability = summarizeReportingObservability({
    runs: reportingRuns ?? [],
    deliveries: reportingDeliveries ?? [],
  });

  const { data: recentCalendarEvents } = await supabase
    .from("calendar_events")
    .select("id, prospect_id, provider, status, title, starts_at, ends_at, meeting_url, created_at")
    .eq("firm_id", firmId)
    .gte("starts_at", thirtyDaysAgo.toISOString())
    .order("starts_at", { ascending: false })
    .limit(50);

  const calendarProspectIds = Array.from(
    new Set(
      (recentCalendarEvents ?? [])
        .map((event) => event.prospect_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  const { data: calendarProspects } = calendarProspectIds.length
    ? await supabase
        .from("prospects")
        .select("id, company_name")
        .in("id", calendarProspectIds)
    : { data: [] };

  const calendarProspectMap = new Map(
    (calendarProspects ?? []).map((prospect) => [prospect.id, prospect.company_name]),
  );
  const recentMeetingLinks = (recentCalendarEvents ?? []).slice(0, 5);

  const { data: enrichmentRuns } = await supabase
    .from("prospect_enrichment_runs")
    .select("id, prospect_id, provider, status, error_message, created_at, completed_at")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(12);

  const enrichmentProspectIds = Array.from(
    new Set(
      (enrichmentRuns ?? [])
        .map((run) => run.prospect_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const { data: enrichmentProspects } = enrichmentProspectIds.length
    ? await supabase
        .from("prospects")
        .select("id, company_name")
        .in("id", enrichmentProspectIds)
    : { data: [] };

  const enrichmentProspectMap = new Map(
    (enrichmentProspects ?? []).map((prospect) => [prospect.id, prospect.company_name]),
  );

  const pendingInvites = (invitations ?? []).filter((invite) => invite.status === "pending").length;
  const ownerCount = (firmMembers ?? []).filter((member) => member.role === "owner").length;
  const oauthProviders = Array.isArray((user as any).app_metadata?.providers)
    ? ((user as any).app_metadata.providers as string[])
    : [];
  const hasGoogleAuth = oauthProviders.includes("google");
  const hasMicrosoftAuth = oauthProviders.includes("azure");
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

  const nowIso = new Date().toISOString();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    generatedEventsResult,
    regeneratedEventsResult,
    approvedEventsResult,
    sentEventsResult,
    dueFollowUpsResult,
    publishedContentResult,
  ] = await Promise.all([
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "generated"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "regenerated"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "approved"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "sent"),
    supabase
      .from("follow_up_tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "pending")
      .lte("due_at", nowIso),
    supabase
      .from("content_drafts")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "published")
      .gte("published_at", monthStart.toISOString()),
  ]);

  const stageCountResults = await Promise.all(
    PIPELINE_STAGES.map((stage) =>
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firmId)
        .eq("pipeline_stage", stage),
    ),
  );

  const stageCounts = PIPELINE_STAGES.reduce((acc, stage, index) => {
    acc[stage] = stageCountResults[index]?.count ?? 0;
    return acc;
  }, {} as StageCounts);

  const generatedCount =
    (generatedEventsResult.count ?? 0) + (regeneratedEventsResult.count ?? 0);
  const approvedCount = approvedEventsResult.count ?? 0;
  const sentCount = sentEventsResult.count ?? 0;
  const dueFollowUps = dueFollowUpsResult.count ?? 0;
  const publishedContentThisMonth = publishedContentResult.count ?? 0;

  const funnel = buildFunnelMetrics({
    generated: generatedCount,
    approved: approvedCount,
    sent: sentCount,
    stageCounts,
  });

  const auditSince = new Date();
  auditSince.setUTCDate(auditSince.getUTCDate() - 30);
  const auditSinceIso = auditSince.toISOString();

  const [agentRunsFeedResult, agentToolCallsFeedResult] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id, run_type, status, created_at, completed_at")
      .eq("firm_id", firmId)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("agent_tool_calls")
      .select("id, run_id, tool_name, status, duration_ms, created_at")
      .eq("firm_id", firmId)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const agentRunsFeed = agentRunsFeedResult.data ?? [];
  const agentToolCallsFeed = agentToolCallsFeedResult.data ?? [];

  const addProspectAction = async (formData: FormData) => {
    "use server";
    const supabase = await createClient();
    const company_name = formData.get("company_name") as string;
    const domain = formData.get("domain") as string;
    const primary_contact_name = formData.get("primary_contact_name") as string;
    const primary_contact_email = formData.get("primary_contact_email") as string;
    const primary_contact_title = formData.get("primary_contact_title") as string;
    const linkedin_url = formData.get("linkedin_url") as string;
    const firm_id = formData.get("firm_id") as string;

    const { error } = await supabase.from("prospects").insert({
      firm_id,
      company_name,
      domain,
      primary_contact_name,
      primary_contact_email,
      primary_contact_title,
      linkedin_url,
      status: "researched",
      pipeline_stage: "researched",
    });

    if (error) {
      redirect(`/dashboard?error=${encodeURIComponent(error.message)}#manual-ingestion`);
    }

    redirect("/dashboard?message=Prospect%20ingested%20successfully#manual-ingestion");
  };

  return (
    <AppShell
      title={`Welcome${user.email ? `, ${user.email}` : ""}`}
      description={`Firm: ${firm?.name ?? "Unknown"} | Role: ${role}`}
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
      currentPath="/dashboard"
      headerActions={
        <>
                <ZenToggle />
                <Link className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest" href="/prospects">
                  Prospect Queue
                </Link>
                <Link className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors uppercase tracking-widest shadow-sm" href="/outreach">
                  New Outreach
                </Link>
        </>
      }
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {isZen && (
          <div className="absolute top-4 right-8 flex items-center gap-2 px-3 py-1 bg-[#2C2A26]/5 rounded-full animate-in fade-in zoom-in duration-500">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6B705C] animate-pulse"></div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B705C]">Zen Mode Active</span>
          </div>
        )}
        
        {params.error ? (
          <p className="mt-4 alert-error">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="mt-4 alert-success">
            {params.message}
          </p>
        ) : null}


        {!isZen && (
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
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-3 stagger-children">
          <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Active Counsel</p>
            <p className="text-3xl font-light text-[#2C2A26] font-display">{firmMembers?.length ?? 0}</p>
          </article>
          <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Firm Administrators</p>
            <p className="text-3xl font-light text-[#2C2A26] font-display">{ownerCount}</p>
          </article>
          <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Pending Access</p>
            <p className="text-3xl font-light text-[#2C2A26] font-display">{pendingInvites}</p>
          </article>
        </section>

        <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
          <div className="mb-8">
            <h2 className="text-xl font-light tracking-tight">Intelligence & Conversion Funnel</h2>
            <p className="mt-2 text-sm text-[#716E68]">
              Operational throughput across the outreach lifecycle.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-5 stagger-children">
            <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Drafts</p>
              <p className="text-2xl font-light font-display">{funnel.generated}</p>
            </article>
            <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Approved</p>
              <p className="text-2xl font-light font-display">{funnel.approved}</p>
            </article>
            <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Dispatched</p>
              <p className="text-2xl font-light font-display">{funnel.sent}</p>
            </article>
            <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Follow-ups</p>
              <p className="text-2xl font-light font-display">{dueFollowUps}</p>
            </article>
            <article className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Studio Content</p>
              <p className="text-2xl font-light font-display">{publishedContentThisMonth}</p>
            </article>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5 stagger-children">
            <article className="rounded border border-emerald-50 bg-emerald-50/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[#6B705C] mb-1">Approval</p>
              <p className="text-lg font-medium text-[#6B705C]">{funnel.approvedRate}%</p>
            </article>
            <article className="rounded border border-blue-50 bg-blue-50/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-blue-600/70 mb-1">Send Rate</p>
              <p className="text-lg font-medium text-blue-700/80">{funnel.sentRateFromApproved}%</p>
            </article>
            <article className="rounded border border-stone-100 bg-stone-50/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Response</p>
              <p className="text-lg font-medium text-stone-700">{funnel.replyRateFromSent}%</p>
            </article>
            <article className="rounded border border-stone-100 bg-stone-50/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Briefing</p>
              <p className="text-lg font-medium text-stone-700">{funnel.meetingRateFromSent}%</p>
            </article>
            <article className="rounded border border-amber-50 bg-amber-50/20 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[#B79455] mb-1">Win Rate</p>
              <p className="text-lg font-medium text-[#B79455]">{funnel.winRateFromSent}%</p>
            </article>
          </div>
        </section>

        <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Firm Intelligence Queue</h2>
                <p className="mt-2 text-sm text-[#716E68]">
                  High-fidelity prospects identified via automated research.
                </p>
              </div>
              <Link href="/prospects" className="text-[10px] uppercase tracking-widest font-bold text-[#2C2A26] hover:opacity-70 transition-opacity border-b-2 border-[#2C2A26] pb-0.5">
                View All
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            {(prospects ?? []).map((prospect) => (
              <div
                key={prospect.id}
                className="group flex flex-wrap items-center justify-between gap-4 rounded border border-[#F7F6F2] bg-[#FDFCFB] px-6 py-5 hover:border-[#D5D1C6] hover:bg-white transition-all duration-300 shadow-sm"
              >
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 rounded-sm bg-[#2C2A26] text-[#F7F6F2] flex items-center justify-center text-xs font-bold uppercase tracking-tighter">
                    {prospect.company_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-medium text-[#2C2A26] group-hover:text-black transition-colors">
                      {prospect.company_name}
                    </h3>
                    <p className="text-[11px] text-[#A19D94] uppercase tracking-wider mt-0.5">{prospect.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-1">Fit Score</p>
                    <span className="text-sm font-medium text-[#6B705C] bg-[#6B705C]/5 px-2 py-0.5 rounded">
                      {prospect.fit_score ?? "???"}
                    </span>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-1">Status</p>
                    <span className="status-badge bg-[#F7F6F2] text-[#716E68] text-[10px] uppercase tracking-widest font-bold">
                      {prospect.status}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#D5D1C6] group-hover:text-[#2C2A26] transition-all transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}

            {(!prospects || prospects.length === 0) && (
              <div className="rounded border-2 border-dashed border-[#EBE8E0] bg-[#FDFCFB]/50 p-12 text-center animate-pulse-subtle">
                <div className="max-w-md mx-auto">
                  <Users className="w-10 h-10 text-[#D5D1C6] mx-auto mb-6 opacity-60" />
                  <h3 className="text-lg font-light text-[#2C2A26] mb-3">Begin Your Intelligence Lifecycle</h3>
                  <p className="text-sm text-[#716E68] leading-relaxed mb-8 font-light">
                    Your firm's prospect queue is currently empty. Start by ingesting leads to activate the research engine and generate targeted outreach.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link href="/prospects" className="w-full sm:w-auto px-6 py-3 bg-[#2C2A26] text-[#F7F6F2] text-[11px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors shadow-lg uppercase tracking-widest">
                      Ingest First Prospect
                    </Link>
                    <Link href="/outreach" className="w-full sm:w-auto px-6 py-3 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded-sm hover:bg-white hover:text-[#2C2A26] transition-all uppercase tracking-widest">
                      Explore Writer
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {!isZen && (
          <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-[#F7F6F2]">
              <div>
                <h2 className="text-xl font-light tracking-tight">Agent Activity & Audit</h2>
                <p className="mt-2 text-sm text-[#716E68]">
                  Recent 30-day operational telemetry for automated workflows.
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href="/api/audit/export?format=json&days=30"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest"
                >
                  Export JSON
                </a>
                <a
                  href="/api/audit/export?format=csv&days=30"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest"
                >
                  Export CSV
                </a>
              </div>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <article>
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-4">Autonomous Runs</h3>
                <div className="space-y-3">
                  {agentRunsFeed.map((run) => (
                    <div
                      key={`agent-run-${run.id}`}
                      className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 shadow-sm hover:border-[#D5D1C6] transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-medium text-[#2C2A26]">
                          <span className="uppercase tracking-wider text-[10px] text-[#A19D94] mr-2">{run.run_type}</span>
                          {run.status}
                        </p>
                      </div>
                      <p className="mt-1 text-[10px] text-[#A19D94] uppercase tracking-tight">
                        {run.id.slice(0, 8)} • {new Date(run.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {!agentRunsFeed.length && (
                    <div className="rounded border border-dashed border-[#EBE8E0] px-4 py-6 text-center">
                      <p className="text-xs text-[#A19D94]">No records in the current window.</p>
                    </div>
                  )}
                </div>
              </article>

              <article>
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-4">Intelligence Signals</h3>
                <div className="space-y-3">
                  {agentToolCallsFeed.map((call) => (
                    <div
                      key={`agent-call-${call.id}`}
                      className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 shadow-sm hover:border-[#D5D1C6] transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-medium text-[#2C2A26]">
                          <span className="uppercase tracking-wider text-[10px] text-[#A19D94] mr-2">{call.tool_name}</span>
                          {call.status}
                        </p>
                        <span className="text-[10px] text-[#A19D94]">{call.duration_ms ?? "-"}ms</span>
                      </div>
                      <p className="mt-1 text-[10px] text-[#A19D94] uppercase tracking-tight">
                        {call.run_id.slice(0, 8)} • {new Date(call.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {!agentToolCallsFeed.length && (
                    <div className="rounded border border-dashed border-[#EBE8E0] px-4 py-6 text-center">
                      <p className="text-xs text-[#A19D94]">No signal records detected.</p>
                    </div>
                  )}
                </div>
              </article>
            </div>
          </section>
        )}

        {!isZen && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <div className="mb-8">
                <h2 className="text-xl font-light tracking-tight">Connected Identity Providers</h2>
                <p className="mt-2 text-sm text-[#716E68]">
                  Authentication state for enterprise resource access.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Google Workspace</p>
                  <p className={hasGoogleAuth ? "text-sm font-medium text-[#6B705C]" : "text-sm font-medium text-[#A19D94]"}>
                    {hasGoogleAuth ? "✓ Authenticated" : "Not connected"}
                  </p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Microsoft 365</p>
                  <p className={hasMicrosoftAuth ? "text-sm font-medium text-[#6B705C]" : "text-sm font-medium text-[#A19D94]"}>
                    {hasMicrosoftAuth ? "✓ Authenticated" : "Not connected"}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <div className="mb-8 pb-6 border-b border-[#F7F6F2]">
                <h2 className="text-xl font-light tracking-tight">Team & Governance</h2>
                <p className="mt-2 text-sm text-[#716E68]">
                  Manage firm permissions and administrative access.
                </p>
              </div>

              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Member</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Permission</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {(firmMembers ?? []).map((member) => (
                      <tr key={member.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[#2C2A26]">{profileMap.get(member.user_id) ?? member.user_id}</span>
                            {member.user_id === user.id && (
                              <span className="px-2 py-0.5 bg-[#EFECE5] text-[#A19D94] text-[9px] uppercase tracking-widest font-bold rounded-full">
                                Personal
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                            {member.role}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {isOwner ? (
                            <div className="flex items-center gap-4">
                              <form action={updateMemberRoleAction} className="flex gap-2">
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="membership_id" value={member.id} />
                                <select
                                  name="new_role"
                                  defaultValue={member.role}
                                  className="px-2 py-1 bg-[#F7F6F2] border border-[#EBE8E0] text-[11px] rounded outline-none appearance-none cursor-pointer hover:bg-white transition-colors"
                                >
                                  <option value="owner">Owner</option>
                                  <option value="attorney">Attorney</option>
                                  <option value="ops">Ops</option>
                                </select>
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider"
                                >
                                  Save
                                </button>
                              </form>
                              <form action={removeMemberAction}>
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="membership_id" value={member.id} />
                                <button
                                  type="submit"
                                  className="px-3 py-1 border border-[#FEE2E2] text-red-600 text-[10px] font-medium rounded hover:bg-red-50 transition-colors uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                                  disabled={member.user_id === user.id}
                                >
                                  Remove
                                </button>
                              </form>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">Read Only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isOwner && (
                <div className="mt-8 pt-8 border-t border-[#F7F6F2]">
                  <h3 className="text-sm font-medium mb-4 text-[#2C2A26]">Invite Counsel</h3>
                  <form action={inviteMemberAction} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="firm_id" value={firmId} />
                    <label className="md:col-span-2">
                      <input
                        className="input-base"
                        name="invite_email"
                        type="email"
                        placeholder="Enter email address..."
                        required
                      />
                    </label>
                    <label>
                      <select
                        className="input-base cursor-pointer"
                        name="invite_role"
                        defaultValue="attorney"
                      >
                        <option value="attorney">Attorney</option>
                        <option value="ops">Operation</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="btn-primary"
                    >
                      Send Invitation
                    </button>
                  </form>
                </div>
              )}

              <div className="mt-8 table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Email</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Role</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Expires</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {(invitations ?? []).map((invite) => (
                      <tr key={invite.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                        <td className="px-5 py-4 text-[#2C2A26]">{invite.email}</td>
                        <td className="px-5 py-4">
                          <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                            {invite.role}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[#A19D94]">
                          <span className={invite.status === "pending" ? "text-[#B79455] font-medium" : ""}>
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[#A19D94] text-xs">
                          {new Date(invite.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          {isOwner && invite.status === "pending" ? (
                            <div className="flex gap-2">
                              <form action={resendInviteAction}>
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="invitation_id" value={invite.id} />
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#EFECE5] text-[#716E68] text-[10px] font-medium rounded hover:bg-[#D5D1C6] transition-colors uppercase tracking-wider"
                                >
                                  Resend
                                </button>
                              </form>
                              <form action={revokeInviteAction}>
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="invitation_id" value={invite.id} />
                                <button
                                  type="submit"
                                  className="px-3 py-1 border border-[#FEE2E2] text-red-600 text-[10px] font-medium rounded hover:bg-red-50 transition-colors uppercase tracking-wider"
                                >
                                  Revoke
                                </button>
                              </form>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!invitations?.length && (
                      <tr>
                        <td className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest" colSpan={5}>
                          No active invitations
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <h2 className="text-xl font-light tracking-tight mb-8">Enrichment Status Queue</h2>
              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Prospect</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Provider</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Telemetry</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {(enrichmentRuns ?? []).map((run) => {
                      const actionRoute =
                        run.provider === "tavily"
                          ? "/api/prospects/enrich/tavily"
                          : run.provider === "firecrawl"
                            ? "/api/prospects/enrich/firecrawl"
                            : run.provider === "exa_search" || run.provider === "exa_contents"
                              ? "/api/prospects/enrich/exa"
                              : run.provider === "vibe"
                                ? "/api/prospects/enrich/vibe"
                                : "";

                      return (
                        <tr key={run.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                          <td className="px-5 py-4 text-[#2C2A26]">
                            {run.prospect_id ? (enrichmentProspectMap.get(run.prospect_id) ?? run.prospect_id) : "-"}
                          </td>
                          <td className="px-5 py-4 capitalize text-[#716E68] text-xs font-medium">{run.provider}</td>
                          <td className="px-5 py-4">
                            <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                              {run.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-[10px] text-[#A19D94] max-w-xs">
                            {run.error_message ? (
                              run.error_message.includes("429") ? "Provider Rate Limit" :
                              run.error_message.includes("Timeout") ? "Extraction Timeout" :
                              run.error_message.slice(0, 100)
                            ) : "Nominal"}
                          </td>
                          <td className="px-5 py-4">
                            {run.status === "failed" && run.prospect_id && actionRoute ? (
                              <form action={actionRoute} method="post">
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="prospect_id" value={run.prospect_id} />
                                {run.provider === "exa_search" && <input type="hidden" name="mode" value="search" />}
                                {run.provider === "exa_contents" && <input type="hidden" name="mode" value="contents" />}
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#EFECE5] text-[#716E68] text-[10px] font-medium rounded hover:bg-[#D5D1C6] transition-colors uppercase tracking-wider"
                                >
                                  Retry
                                </button>
                              </form>
                            ) : (
                              <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!enrichmentRuns?.length && (
                      <tr>
                        <td className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest" colSpan={5}>
                          No active enrichment tasks
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                <div>
                  <h2 className="text-xl font-light tracking-tight">Reporting Digest Health</h2>
                  <p className="mt-2 text-sm text-[#716E68]">
                    Weekly orchestration and delivery telemetry for firm-wide insights.
                  </p>
                </div>
                <form action="/api/reporting/schedule/weekly" method="post">
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Trigger Outbound
                  </button>
                </form>
              </div>

              <div
                className={
                  reportingObservability.degraded
                    ? "mb-8 rounded border border-red-100 bg-red-50/50 px-5 py-4 text-xs text-red-700"
                    : "mb-8 rounded border border-[#EFECE5] bg-[#FDFCFB] px-5 py-4 text-xs text-[#6B705C]"
                }
              >
                <p className="uppercase tracking-widest font-bold mb-1">
                  System Health: {reportingObservability.degraded ? "Issues Detected" : "Nominal"}
                </p>
                <p className="text-[#716E68]">
                  {reportingObservability.degraded
                    ? "Delivery failures detected in recent cycles. Manual verification recommended."
                    : "All scheduled reports delivered successfully to firm recipients."}
                </p>
                <p className="mt-2 italic font-medium">{reportingObservability.actionHint}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-4 mb-8">
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Total Cycles</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">{reportingRuns?.length ?? 0}</p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Failed (Last)</p>
                  <p className={`text-xl font-light tracking-tight ${reportingObservability.failedCount > 0 ? "text-red-600" : "text-[#2C2A26]"}`}>
                    {reportingObservability.failedCount}
                  </p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Delivered (Last)</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">{reportingObservability.sentCount}</p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Last Run</p>
                  <p className="text-[11px] font-medium text-[#716E68]">
                    {reportingObservability.lastRunAt
                      ? new Date(reportingObservability.lastRunAt).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>

              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Reporting Window</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Intelligence Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {(reportingRuns ?? []).map((run) => (
                      <tr key={`reporting-run-${run.id}`} className="hover:bg-[#FDFCFB]/50 transition-colors">
                        <td className="px-5 py-4 text-xs font-medium text-[#2C2A26]">
                          {run.week_start} — {run.week_end}
                        </td>
                        <td className="px-5 py-4">
                          <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">{run.status}</span>
                        </td>
                        <td className="px-5 py-4 text-xs text-[#716E68]">
                          {run.summary_title ?? "Operational report generated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                <div>
                  <h2 className="text-xl font-light tracking-tight">Calendar Synchronization</h2>
                  <p className="mt-2 text-sm text-[#716E68]">
                    Recent engagement events identified via connected workspace accounts.
                  </p>
                </div>
                <Link
                  href="/pipeline"
                  className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest flex items-center"
                >
                  Open Pipeline
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3 mb-8">
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Synced Events (30d)</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">{recentCalendarEvents?.length ?? 0}</p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Video Sessions</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">
                    {(recentCalendarEvents ?? []).filter((event) => Boolean(event.meeting_url)).length}
                  </p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Cancellations</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">
                    {(recentCalendarEvents ?? []).filter((event) => event.status === "cancelled").length}
                  </p>
                </div>
              </div>

              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Prospect</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Schedule</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {recentMeetingLinks.map((event) => (
                      <tr key={`calendar-linked-${event.id}`} className="hover:bg-[#FDFCFB]/50 transition-colors">
                        <td className="px-5 py-4 font-medium text-[#2C2A26]">
                          {calendarProspectMap.get(event.prospect_id) ?? event.prospect_id}
                        </td>
                        <td className="px-5 py-4 text-xs text-[#716E68]">
                          {new Date(event.starts_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">{event.status}</span>
                        </td>
                        <td className="px-5 py-4">
                          {event.meeting_url ? (
                            <a
                              className="px-3 py-1 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider block text-center"
                              href={event.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Join
                            </a>
                          ) : (
                            <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!recentMeetingLinks.length && (
                      <tr>
                        <td className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest" colSpan={5}>
                          No synced engagements detected
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                <div>
                  <h2 className="text-xl font-light tracking-tight">Research Orchestrator</h2>
                  <p className="mt-2 text-sm text-[#716E68]">
                    Orchestrate intelligence runs across the full prospect dataset.
                  </p>
                </div>
                <form action="/api/research/runs" method="post">
                  <input type="hidden" name="firm_id" value={firmId} />
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Trigger All
                  </button>
                </form>
              </div>

              <div className="grid gap-4 md:grid-cols-3 mb-8">
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Active Runs</p>
                  <p className="text-xl font-light tracking-tight text-[#2C2A26]">{scheduledRuns.length}</p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Run Failures</p>
                  <p className={`text-xl font-light tracking-tight ${scheduledFailedCount > 0 ? "text-red-600" : "text-[#2C2A26]"}`}>
                    {scheduledFailedCount}
                  </p>
                </div>
                <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Last Sync</p>
                  <p className="text-[11px] font-medium text-[#716E68]">
                    {latestScheduledRun ? new Date(latestScheduledRun.created_at).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </div>

              <div className="table-shell">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Job ID</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Trigger</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Throughput</th>
                      <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F7F6F2]">
                    {(researchRuns ?? []).map((run) => {
                      const summary =
                        run.run_summary && typeof run.run_summary === "object"
                          ? (run.run_summary as Record<string, unknown>)
                          : {};
                      const totalProspects = Number(summary.total_prospects ?? 0);
                      const successCount = Number(summary.provider_success_count ?? 0);
                      const failedCount = Number(summary.provider_failure_count ?? 0);

                      return (
                        <tr key={run.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                          <td className="px-5 py-4 font-mono text-[10px] text-[#A19D94]">{run.id.slice(0, 8)}</td>
                          <td className="px-5 py-4 capitalize text-xs text-[#716E68]">
                            {run.trigger_type}
                            {run.retry_count > 0 ? ` (${run.retry_count})` : ""}
                          </td>
                          <td className="px-5 py-4">
                            <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                              {run.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-[10px] text-[#A19D94]">
                            S: {successCount} | F: {failedCount} | T: {totalProspects}
                          </td>
                          <td className="px-5 py-4">
                            {run.status === "failed" ? (
                              <form action="/api/research/runs" method="post">
                                <input type="hidden" name="firm_id" value={firmId} />
                                <input type="hidden" name="retry_run_id" value={run.id} />
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#EFECE5] text-[#716E68] text-[10px] font-medium rounded hover:bg-[#D5D1C6] transition-colors uppercase tracking-wider"
                                >
                                  Retry
                                </button>
                              </form>
                            ) : (
                              <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!researchRuns?.length && (
                      <tr>
                        <td className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest" colSpan={5}>
                          No historical runs detected
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}



