import Link from "next/link";
import { redirect } from "next/navigation";

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
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  message?: string;
  q?: string;
  status?: string;
  min_score?: string;
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("firm_memberships")
    .select("firm_id, role, firms(name)")
    .eq("user_id", user.id);

  if (membershipsError) {
    redirect(
      `/onboarding?error=${encodeURIComponent("Unable to load firm membership. Please retry or sign in again.")}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const primary = memberships[0];
  const firm = Array.isArray(primary.firms) ? primary.firms[0] : primary.firms;
  const accessState = await getFirmAccessState({
    supabase,
    firmId: primary.firm_id,
  });
  const isOwner = primary.role === "owner";
  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.status?.trim().toLowerCase() ?? "all";
  const minScore = Number(params.min_score ?? "");
  const hasMinScore = Number.isFinite(minScore) && minScore >= 0;

  const { data: firmMembers } = await supabase
    .from("firm_memberships")
    .select("id, user_id, role, created_at")
    .eq("firm_id", primary.firm_id)
    .order("created_at", { ascending: true });

  const memberIds = (firmMembers ?? []).map((member) => member.user_id);
  const { data: memberProfiles } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberIds)
    : { data: [] };

  const profileMap = new Map(
    (memberProfiles ?? []).map((profile) => [profile.id, profile.display_name]),
  );

  const { data: invitations } = await supabase
    .from("firm_invitations")
    .select("id, email, role, status, invited_at, expires_at")
    .eq("firm_id", primary.firm_id)
    .order("invited_at", { ascending: false })
    .limit(20);

  let prospectsQuery = supabase
    .from("prospects")
    .select("id, company_name, domain, status, fit_score, score_explanation, created_at")
    .eq("firm_id", primary.firm_id);

  if (searchQuery) {
    prospectsQuery = prospectsQuery.or(
      `company_name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%`,
    );
  }

  if (statusFilter && statusFilter !== "all") {
    prospectsQuery = prospectsQuery.eq("status", statusFilter);
  }

  if (hasMinScore) {
    prospectsQuery = prospectsQuery.gte("fit_score", minScore);
  }

  const { data: prospects } = await prospectsQuery
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: researchRuns } = await supabase
    .from("research_runs")
    .select("id, trigger_type, status, retry_count, run_summary, error_message, created_at")
    .eq("firm_id", primary.firm_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const scheduledRuns = (researchRuns ?? []).filter((run) => run.trigger_type === "scheduled");
  const scheduledFailedCount = scheduledRuns.filter((run) => run.status === "failed").length;
  const latestScheduledRun = scheduledRuns[0];

  const { data: reportingRuns } = await supabase
    .from("reporting_runs")
    .select("id, status, week_start, week_end, summary_title, error_message, created_at, completed_at")
    .eq("firm_id", primary.firm_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const reportingRunIds = (reportingRuns ?? []).map((run) => run.id);
  const { data: reportingDeliveries } = reportingRunIds.length
    ? await supabase
        .from("reporting_deliveries")
        .select(
          "id, reporting_run_id, delivery_mode, recipient, status, error_message, created_at, attempted_at, attempt_count, last_error_code, last_error_message",
        )
        .eq("firm_id", primary.firm_id)
        .in("reporting_run_id", reportingRunIds)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const reportingObservability = summarizeReportingObservability({
    runs: reportingRuns ?? [],
    deliveries: reportingDeliveries ?? [],
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const { data: recentCalendarEvents } = await supabase
    .from("calendar_events")
    .select("id, prospect_id, provider, status, title, starts_at, ends_at, meeting_url, created_at")
    .eq("firm_id", primary.firm_id)
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
    .eq("firm_id", primary.firm_id)
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
  const oauthProviders = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : [];
  const hasGoogleAuth = oauthProviders.includes("google");
  const hasMicrosoftAuth = oauthProviders.includes("azure");
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
      .eq("firm_id", primary.firm_id)
      .eq("action_type", "generated"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", primary.firm_id)
      .eq("action_type", "regenerated"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", primary.firm_id)
      .eq("action_type", "approved"),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", primary.firm_id)
      .eq("action_type", "sent"),
    supabase
      .from("follow_up_tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", primary.firm_id)
      .eq("status", "pending")
      .lte("due_at", nowIso),
    supabase
      .from("content_drafts")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", primary.firm_id)
      .eq("status", "published")
      .gte("published_at", monthStart.toISOString()),
  ]);

  const stageCountResults = await Promise.all(
    PIPELINE_STAGES.map((stage) =>
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", primary.firm_id)
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
      .eq("firm_id", primary.firm_id)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("agent_tool_calls")
      .select("id, run_id, tool_name, status, duration_ms, created_at")
      .eq("firm_id", primary.firm_id)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const agentRunsFeed = agentRunsFeedResult.data ?? [];
  const agentToolCallsFeed = agentToolCallsFeedResult.data ?? [];

  return (
    <AppShell
      title={`Welcome${user.email ? `, ${user.email}` : ""}`}
      description={`Firm: ${firm?.name ?? "Unknown"} | Role: ${primary.role}`}
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
      mobileCta={{ href: "/outreach", label: "Open Outreach Writer" }}
      headerActions={
        <>
          <Link className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200" href="/outreach">
            Outreach
          </Link>
          <Link className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200" href="/pipeline">
            Pipeline
          </Link>
          <Link className="rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200" href="/content-studio">
            Content
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


        <section className="mt-6 glass-card p-6 reveal-up">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-medium">Billing & Subscription</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Polar checkout and customer portal for your firm workspace.
              </p>
            </div>
            {isOwner ? (
              <Link
                href="/portal"
                className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200"
              >
                Manage billing portal
              </Link>
            ) : (
              <span className="rounded-md border border-white/20 bg-[#0D1117] px-3 py-2 text-xs text-[#94A3B8]">
                Owner access required
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4 stagger-children">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Status</p>
              <p className={billingIsActive ? "mt-2 text-lg font-semibold text-emerald-200 live-status" : "mt-2 text-lg font-semibold text-amber-200"}>
                {billingStatus ?? "inactive"}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Plan</p>
              <p className="mt-2 text-lg font-semibold">{billingPlanLabel}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Period end</p>
              <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
                {billingPeriodEnd ? new Date(billingPeriodEnd).toLocaleDateString() : "-"}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Auto-renew</p>
              <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
                {billingCancelAtPeriodEnd ? "Cancels at period end" : "On"}
              </p>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner ? (
              <>
                <Link
                  href="/checkout?plan=starter"
                  className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
                >
                  Choose Starter
                </Link>
                <Link
                  href="/checkout?plan=pro"
                  className="rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  Choose Pro
                </Link>
                <Link
                  href="/checkout?plan=premium"
                  className="rounded-md border border-fuchsia-300/40 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-200"
                >
                  Choose Premium
                </Link>
              </>
            ) : null}
          </div>

          {!isOwner ? (
            <p className="mt-3 text-xs text-[#94A3B8]">
              Only firm owners can open checkout or manage billing.
            </p>
          ) : null}
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3 stagger-children">
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Team members</p>
            <p className="mt-2 text-2xl font-semibold">{firmMembers?.length ?? 0}</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Owners</p>
            <p className="mt-2 text-2xl font-semibold">{ownerCount}</p>
          </article>
          <article className="metric-card">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Pending invites</p>
            <p className="mt-2 text-2xl font-semibold">{pendingInvites}</p>
          </article>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">Sprint 5 KPI & Conversion Funnel</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Metrics are derived from outreach events and pipeline stage progression.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-5 stagger-children">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Drafts generated</p>
              <p className="mt-2 text-2xl font-semibold">{funnel.generated}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Approved</p>
              <p className="mt-2 text-2xl font-semibold">{funnel.approved}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Sent</p>
              <p className="mt-2 text-2xl font-semibold">{funnel.sent}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Follow-ups due</p>
              <p className="mt-2 text-2xl font-semibold">{dueFollowUps}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Published content (month)</p>
              <p className="mt-2 text-2xl font-semibold">{publishedContentThisMonth}</p>
            </article>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5 stagger-children">
            <article className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-200">Approval rate</p>
              <p className="mt-2 text-xl font-semibold text-emerald-100">{funnel.approvedRate}%</p>
            </article>
            <article className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Send rate</p>
              <p className="mt-2 text-xl font-semibold text-cyan-100">{funnel.sentRateFromApproved}%</p>
            </article>
            <article className="rounded-lg border border-indigo-300/30 bg-indigo-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-indigo-200">Reply rate</p>
              <p className="mt-2 text-xl font-semibold text-indigo-100">{funnel.replyRateFromSent}%</p>
            </article>
            <article className="rounded-lg border border-fuchsia-300/30 bg-fuchsia-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-fuchsia-200">Meeting rate</p>
              <p className="mt-2 text-xl font-semibold text-fuchsia-100">{funnel.meetingRateFromSent}%</p>
            </article>
            <article className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-amber-200">Win rate</p>
              <p className="mt-2 text-xl font-semibold text-amber-100">{funnel.winRateFromSent}%</p>
            </article>
          </div>

          <div className="mt-6 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Pipeline stage</th>
                  <th className="px-4 py-3 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {PIPELINE_STAGES.map((stage) => (
                  <tr key={`stage-row-${stage}`} className="border-t border-white/10">
                    <td className="px-4 py-3 capitalize">{stage}</td>
                    <td className="px-4 py-3">{stageCounts[stage]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-medium">Agent Activity & Audit Export</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Recent 30-day operational feed for agent runs and tool calls.
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/api/audit/export?format=json&days=30"
                className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200"
              >
                Export JSON (30d)
              </a>
              <a
                href="/api/audit/export?format=csv&days=30"
                className="rounded-md border border-fuchsia-300/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-200"
              >
                Export CSV (30d)
              </a>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-[#0D1117] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                Agent runs
              </h3>
              <div className="mt-3 space-y-2">
                {agentRunsFeed.map((run) => (
                  <div
                    key={`agent-run-${run.id}`}
                    className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2"
                  >
                    <p className="text-xs text-[#CBD5E1]">
                      <span className="uppercase tracking-wide text-[#94A3B8]">{run.run_type}</span>{" "}
                      {run.status}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">
                      Run {run.id.slice(0, 8)} | {new Date(run.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {!agentRunsFeed.length ? (
                  <p className="rounded-lg border border-dashed border-white/20 bg-[#111827] px-3 py-2 text-sm text-[#94A3B8]">
                    No agent run records in the last 30 days.
                  </p>
                ) : null}
              </div>
            </article>

            <article className="rounded-xl border border-white/10 bg-[#0D1117] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                Tool calls
              </h3>
              <div className="mt-3 space-y-2">
                {agentToolCallsFeed.map((call) => (
                  <div
                    key={`agent-call-${call.id}`}
                    className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2"
                  >
                    <p className="text-xs text-[#CBD5E1]">
                      <span className="uppercase tracking-wide text-[#94A3B8]">{call.tool_name}</span>{" "}
                      {call.status}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">
                      Run {call.run_id.slice(0, 8)} | {call.duration_ms ?? "-"}ms |{" "}
                      {new Date(call.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {!agentToolCallsFeed.length ? (
                  <p className="rounded-lg border border-dashed border-white/20 bg-[#111827] px-3 py-2 text-sm text-[#94A3B8]">
                    No agent tool-call records in the last 30 days.
                  </p>
                ) : null}
              </div>
            </article>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">Connected sign-in providers</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            OAuth provider status for your current user account.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3 text-sm">
              <p className="font-medium">Google</p>
              <p className={hasGoogleAuth ? "mt-1 text-emerald-300" : "mt-1 text-[#94A3B8]"}>
                {hasGoogleAuth ? "Connected" : "Not connected"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3 text-sm">
              <p className="font-medium">Microsoft</p>
              <p className={hasMicrosoftAuth ? "mt-1 text-emerald-300" : "mt-1 text-[#94A3B8]"}>
                {hasMicrosoftAuth ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#94A3B8]">
            To connect a provider, sign out and use &quot;Continue with Google/Microsoft&quot; on the sign-in page.
          </p>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">Team & access</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Manage owner/attorney/ops access for your firm workspace.
          </p>

          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(firmMembers ?? []).map((member) => (
                  <tr key={member.id} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{profileMap.get(member.user_id) ?? member.user_id}</span>
                        {member.user_id === user.id ? (
                          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#94A3B8]">
                            You
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="status-badge capitalize">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={updateMemberRoleAction} className="flex gap-2">
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="membership_id" value={member.id} />
                            <select
                              name="new_role"
                              defaultValue={member.role}
                              aria-label={`Role for ${profileMap.get(member.user_id) ?? member.user_id}`}
                              className="rounded-md border border-white/15 bg-[#0D1117] px-2 py-1 text-xs outline-none ring-[#8B5CF6] focus:ring-2"
                            >
                              <option value="owner">Owner</option>
                              <option value="attorney">Attorney</option>
                              <option value="ops">Ops</option>
                            </select>
                            <button
                              type="submit"
                              className="btn-xs btn-secondary"
                            >
                              Update
                            </button>
                          </form>
                          <form action={removeMemberAction}>
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="membership_id" value={member.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-red-400/40 bg-red-500/10 px-2 py-1 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={member.user_id === user.id}
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-[#94A3B8]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isOwner ? (
            <form action={inviteMemberAction} className="mt-5 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="firm_id" value={primary.firm_id} />
              <label className="grid gap-1 md:col-span-2">
                <span className="sr-only">Invite teammate email</span>
                <input
                  className="input-base"
                  name="invite_email"
                  type="email"
                  placeholder="teammate@firm.com"
                  required
                />
              </label>
              <label className="grid gap-1">
                <span className="sr-only">Invite teammate role</span>
                <select
                  className="input-base"
                  name="invite_role"
                  defaultValue="attorney"
                >
                  <option value="attorney">Attorney</option>
                  <option value="ops">Ops</option>
                </select>
              </label>
              <button
                type="submit"
                className="btn-base btn-primary"
              >
                Invite member
              </button>
            </form>
          ) : null}

          <div className="mt-6 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Invite email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(invitations ?? []).map((invite) => (
                  <tr key={invite.id} className="border-t border-white/10">
                    <td className="px-4 py-3">{invite.email}</td>
                    <td className="px-4 py-3">
                      <span className="status-badge capitalize">
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          invite.status === "pending"
                            ? "rounded-full border border-amber-300/40 bg-amber-500/15 px-2.5 py-1 text-xs capitalize text-amber-200"
                            : "status-badge capitalize"
                        }
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {isOwner && invite.status === "pending" ? (
                        <div className="flex gap-2">
                          <form action={resendInviteAction}>
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="invitation_id" value={invite.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-white/20 bg-[#161B22] px-3 py-1.5 text-xs"
                            >
                              Resend
                            </button>
                          </form>
                          <form action={revokeInviteAction}>
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="invitation_id" value={invite.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
                            >
                              Revoke
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-[#94A3B8]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!invitations?.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={5}>
                      No invitations yet. Invite your first teammate above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Link className="text-sm text-[#8B5CF6] hover:underline" href="/invite">
              Open my invitation inbox
            </Link>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">Manual prospect ingestion</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Add one prospect at a time. Dedupe runs on firm + domain/email before insert.
          </p>

          <form action="/api/prospects/ingest" method="post" className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="firm_id" value={primary.firm_id} />
            <label className="grid gap-1">
              <span className="sr-only">Company name</span>
              <input
                className="input-base"
                name="company_name"
                placeholder="Company name"
                required
                type="text"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Company domain</span>
              <input
                className="input-base"
                name="domain"
                placeholder="company.com"
                type="text"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Primary contact name</span>
              <input
                className="input-base"
                name="primary_contact_name"
                placeholder="Primary contact name"
                type="text"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Primary contact email</span>
              <input
                className="input-base"
                name="primary_contact_email"
                placeholder="contact@company.com"
                type="email"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Primary contact title</span>
              <input
                className="input-base"
                name="primary_contact_title"
                placeholder="GC / COO / Founder"
                type="text"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">LinkedIn URL</span>
              <input
                className="input-base"
                name="linkedin_url"
                placeholder="https://linkedin.com/in/..."
                type="url"
              />
            </label>
            <button
              className="btn-base btn-primary md:col-span-2"
              type="submit"
            >
              Add prospect
            </button>
          </form>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">CouncilFlow Intelligence (Exa + Vibe)</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Proactive market discovery with Exa neural search and high-fidelity B2B enrichment with Vibe.
          </p>

          <form method="get" className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#0D1117] p-4 md:grid-cols-4">
            <label className="grid gap-1">
              <span className="sr-only">Search prospects</span>
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Search company or domain"
                className="input-base text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Prospect status filter</span>
              <select
                name="status"
                defaultValue={statusFilter}
                className="input-base text-sm"
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="enriched">Enriched</option>
                <option value="qualified">Qualified</option>
                <option value="disqualified">Disqualified</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="sr-only">Minimum fit score</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                name="min_score"
                defaultValue={hasMinScore ? String(minScore) : ""}
                placeholder="Min score"
                className="input-base text-sm"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
              >
                Apply filters
              </button>
              <Link
                href="/dashboard"
                className="btn-base btn-ghost text-[#CBD5E1]"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Fit Score</th>
                  <th className="px-4 py-3 font-medium">Top reasons</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(prospects ?? []).map((prospect) => (
                  <tr key={prospect.id} className="border-t border-white/10">
                    <td className="px-4 py-3">{prospect.company_name}</td>
                    <td className="px-4 py-3 text-[#CBD5E1]">{prospect.domain ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="status-badge capitalize">
                        {prospect.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {prospect.fit_score != null ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            prospect.fit_score >= 80 ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-200" :
                            prospect.fit_score >= 50 ? "border-blue-300/30 bg-blue-500/15 text-blue-200" :
                            prospect.fit_score <= 30 ? "border-red-400/30 bg-red-500/15 text-red-200" :
                            "border-white/20 bg-white/5 text-white/70"
                          }`}>
                            {prospect.fit_score}
                          </span>
                          {prospect.fit_score <= 30 && Array.isArray(prospect.score_explanation) && prospect.score_explanation.some((e: any) => ["layoff_signal", "bankruptcy_signal", "legal_risk_signal"].includes(e.signal_type)) && (
                            <span className="text-[10px] uppercase tracking-tighter text-red-400 font-bold">🚩 Risk Detected</span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                      {Array.isArray(prospect.score_explanation) && prospect.score_explanation.length ? (
                        <div className="space-y-1.5">
                          {prospect.score_explanation
                            .slice(0, 3)
                            .map((item: any, index: number) => {
                              const isPositive = (item.contribution ?? 0) > 0;
                              const isRedFlag = ["layoff_signal", "bankruptcy_signal", "legal_risk_signal"].includes(item.signal_type);
                              
                              return (
                                <div key={`${prospect.id}-reason-${index}`} className="flex items-start gap-2">
                                  <span className={`mt-0.5 whitespace-nowrap font-mono text-[10px] font-bold ${
                                    isRedFlag ? "text-red-400" :
                                    isPositive ? "text-emerald-400" : "text-amber-400"
                                  }`}>
                                    {isPositive ? "+" : ""}{Math.round(item.contribution)}
                                  </span>
                                  <p className={isRedFlag ? "text-red-200/80 italic" : ""}>
                                    {item.reason ?? "Signal detected"}
                                  </p>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">No reasons yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                        <form action="/api/research/runs" method="post">
                          <input type="hidden" name="firm_id" value={primary.firm_id} />
                          <input type="hidden" name="prospect_id" value={prospect.id} />
                          <input type="hidden" name="limit" value="1" />
                          <button
                            className="rounded-md border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-3 py-1.5 text-xs font-semibold text-[#A78BFA] transition-colors hover:bg-[#8B5CF6]/20"
                            type="submit"
                          >
                            Run Intelligence
                          </button>
                        </form>
                        <div className="flex opacity-60 transition-opacity hover:opacity-100">
                          <form action="/api/prospects/enrich/exa" method="post">
                            <input type="hidden" name="prospect_id" value={prospect.id} />
                            <input type="hidden" name="mode" value="search" />
                            <button
                              className="rounded-l-md border border-r-0 border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/10"
                              type="submit" title="Exa Search"
                            >
                              Search
                            </button>
                          </form>
                          <form action="/api/prospects/enrich/exa" method="post">
                            <input type="hidden" name="prospect_id" value={prospect.id} />
                            <input type="hidden" name="mode" value="contents" />
                            <button
                              className="border-y border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/10"
                              type="submit" title="Exa Scrape"
                            >
                              Scrape
                            </button>
                          </form>
                          <form action="/api/prospects/enrich/vibe" method="post">
                            <input type="hidden" name="prospect_id" value={prospect.id} />
                            <button
                              className="rounded-r-md border border-l-0 border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/10"
                              type="submit" title="Vibe Enrich"
                            >
                              Vibe
                            </button>
                          </form>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {!prospects?.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-12 text-center" colSpan={6}>
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="rounded-full bg-white/5 p-3">
                          <svg className="h-6 w-6 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-[#CBD5E1]">No prospects found</p>
                        <p className="text-xs text-[#94A3B8]">Use the manual ingestion form above to add your first target company.</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <h2 className="text-xl font-medium">Enrichment Runs (Recent)</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Retry failed provider runs directly from this queue.
          </p>
          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Prospect</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={run.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        {run.prospect_id ? (enrichmentProspectMap.get(run.prospect_id) ?? run.prospect_id) : "-"}
                      </td>
                      <td className="px-4 py-3 capitalize">{run.provider}</td>
                      <td className="px-4 py-3">
                        <span className="status-badge capitalize">
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                        {run.error_message ? (
                          run.error_message.includes("429") ? "API Rate limit reached. The system will retry shortly." :
                          run.error_message.includes("Timeout") ? "Request timed out during deep extraction." :
                          run.error_message.slice(0, 140)
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {run.status === "failed" && run.prospect_id && actionRoute ? (
                          <form action={actionRoute} method="post">
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="prospect_id" value={run.prospect_id} />
                            {run.provider === "exa_search" && <input type="hidden" name="mode" value="search" />}
                            {run.provider === "exa_contents" && <input type="hidden" name="mode" value="contents" />}
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
                            >
                              Retry provider
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!enrichmentRuns?.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={5}>
                      No enrichment runs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium">Reporting Digest Status</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Weekly digest generation and delivery activity for your firm.
              </p>
            </div>
            <form action="/api/reporting/schedule/weekly" method="post">
              <button
                type="submit"
                className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
              >
                Run reporting now
              </button>
            </form>
          </div>

          <div
            className={
              reportingObservability.degraded
                ? "mt-4 rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                : "mt-4 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
            }
          >
            <p className="text-xs uppercase tracking-[0.16em]">
              Reporting health
            </p>
            <p className="mt-1">
              {reportingObservability.degraded
                ? "Degraded: failed deliveries detected in the latest run or run status is failed."
                : "Healthy: latest reporting run completed without delivery failures."}
            </p>
            <p className="mt-1 text-xs text-[#CBD5E1]">{reportingObservability.actionHint}</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Recent runs</p>
              <p className="mt-2 text-2xl font-semibold">{reportingRuns?.length ?? 0}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Failed deliveries (last run)</p>
              <p
                className={
                  reportingObservability.failedCount > 0
                    ? "mt-2 text-2xl font-semibold text-amber-300"
                    : "mt-2 text-2xl font-semibold"
                }
              >
                {reportingObservability.failedCount}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Sent deliveries (last run)</p>
              <p className="mt-2 text-2xl font-semibold">{reportingObservability.sentCount}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Last digest run</p>
              <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
                {reportingObservability.lastRunAt
                  ? new Date(reportingObservability.lastRunAt).toLocaleString()
                  : "No reporting runs yet"}
              </p>
            </article>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Top error codes (last run)</p>
              <div className="mt-2 space-y-1 text-sm text-[#CBD5E1]">
                {reportingObservability.topErrorCodes.length ? (
                  reportingObservability.topErrorCodes.map((item) => (
                    <p key={`reporting-error-${item.code}`}>
                      {item.code}: {item.count}
                    </p>
                  ))
                ) : (
                  <p className="text-[#94A3B8]">No delivery error codes in the latest run.</p>
                )}
              </div>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Retries exhausted (last run)</p>
              <p
                className={
                  reportingObservability.maxAttemptsReachedCount > 0
                    ? "mt-2 text-2xl font-semibold text-amber-300"
                    : "mt-2 text-2xl font-semibold"
                }
              >
                {reportingObservability.maxAttemptsReachedCount}
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Count of failed deliveries that reached 3 attempts.
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Config failures (last run)</p>
              <p
                className={
                  reportingObservability.configFailureCount > 0
                    ? "mt-2 text-2xl font-semibold text-amber-300"
                    : "mt-2 text-2xl font-semibold"
                }
              >
                {reportingObservability.configFailureCount}
              </p>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Missing recipients or resend sender settings.
              </p>
            </article>
          </div>

          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Week</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Summary</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {(reportingRuns ?? []).map((run) => (
                  <tr key={`reporting-run-${run.id}`} className="border-t border-white/10">
                    <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                      {run.week_start} to {run.week_end}
                    </td>
                    <td className="px-4 py-3">
                      <span className="status-badge capitalize">{run.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                      {run.summary_title ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                      {run.error_message ? run.error_message.slice(0, 140) : "-"}
                    </td>
                  </tr>
                ))}
                {!reportingRuns?.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={4}>
                      No reporting runs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium">Calendar-Linked Meetings</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Last 30 days of meeting events synced to calendar.
              </p>
            </div>
            <Link
              href="/pipeline"
              className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
            >
              Open pipeline
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Meeting links (30d)</p>
              <p className="mt-2 text-2xl font-semibold">{recentCalendarEvents?.length ?? 0}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">With video URL</p>
              <p className="mt-2 text-2xl font-semibold">
                {(recentCalendarEvents ?? []).filter((event) => Boolean(event.meeting_url)).length}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Cancelled</p>
              <p className="mt-2 text-2xl font-semibold">
                {(recentCalendarEvents ?? []).filter((event) => event.status === "cancelled").length}
              </p>
            </article>
          </div>

          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Prospect</th>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {recentMeetingLinks.map((event) => (
                  <tr key={`calendar-linked-${event.id}`} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      {calendarProspectMap.get(event.prospect_id) ?? event.prospect_id}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                      {new Date(event.starts_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 capitalize">{event.provider}</td>
                    <td className="px-4 py-3">
                      <span className="status-badge capitalize">{event.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {event.meeting_url ? (
                        <a
                          className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200"
                          href={event.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-[#94A3B8]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!recentMeetingLinks.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={5}>
                      No calendar-linked meetings in the last 30 days.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 glass-card p-6 reveal-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium">Research Orchestrator</h2>
              <p className="mt-2 text-sm text-[#94A3B8]">
                Run both providers across your current prospect set and retry failed jobs.
              </p>
            </div>
            <form action="/api/research/runs" method="post">
              <input type="hidden" name="firm_id" value={primary.firm_id} />
              <button
                type="submit"
                className="btn-base btn-primary"
              >
                Run research now
              </button>
            </form>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Scheduled runs</p>
              <p className="mt-2 text-2xl font-semibold">{scheduledRuns.length}</p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Scheduled failures</p>
              <p className={scheduledFailedCount > 0 ? "mt-2 text-2xl font-semibold text-amber-300" : "mt-2 text-2xl font-semibold"}>
                {scheduledFailedCount}
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Last scheduled run</p>
              <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
                {latestScheduledRun ? new Date(latestScheduledRun.created_at).toLocaleString() : "No scheduled runs yet"}
              </p>
            </article>
          </div>

          <div className="mt-4 table-shell">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0D1117] text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Trigger</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Summary</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(researchRuns ?? []).map((run) => {
                  const summary =
                    run.run_summary && typeof run.run_summary === "object"
                      ? (run.run_summary as Record<string, unknown>)
                      : {};
                  const totalProspects = Number(summary.total_prospects ?? 0);
                  const successCount = Number(summary.provider_success_count ?? 0);
                  const failedCount = Number(summary.provider_failure_count ?? 0);

                  return (
                    <tr key={run.id} className="border-t border-white/10">
                      <td className="px-4 py-3 text-xs text-[#CBD5E1]">{run.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 capitalize">
                        {run.trigger_type}
                        {run.retry_count > 0 ? ` (${run.retry_count})` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className="status-badge capitalize">
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                        Prospects: {totalProspects} | Provider success: {successCount} | Provider fail:{" "}
                        {failedCount}
                        {run.error_message ? ` | ${run.error_message}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        {run.status === "failed" ? (
                          <form action="/api/research/runs" method="post">
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="retry_run_id" value={run.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
                            >
                              Retry failed
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!researchRuns?.length ? (
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={5}>
                      No research runs yet. Start your first orchestrated run.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {scheduledFailedCount > 0 ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-amber-300/30 bg-amber-500/10">
              <div className="px-4 py-3 text-sm font-medium text-amber-200">
                Scheduled run failures need attention
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0D1117] text-[#94A3B8]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Run</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Error</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledRuns
                    .filter((run) => run.status === "failed")
                    .slice(0, 5)
                    .map((run) => (
                      <tr key={`scheduled-failure-${run.id}`} className="border-t border-white/10">
                        <td className="px-4 py-3 text-xs text-[#CBD5E1]">{run.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                          {new Date(run.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                          {run.error_message ?? "Unknown scheduler failure"}
                        </td>
                        <td className="px-4 py-3">
                          <form action="/api/research/runs" method="post">
                            <input type="hidden" name="firm_id" value={primary.firm_id} />
                            <input type="hidden" name="retry_run_id" value={run.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
                            >
                              Retry as manual
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
    </AppShell>
  );
}



