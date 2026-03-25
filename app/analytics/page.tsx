import Link from "next/link";
import { redirect } from "next/navigation";

import { buildFunnelMetrics, type StageCounts } from "@/lib/analytics/funnel";
import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { getBillingPlanLabelByProductId } from "@/lib/billing/plans";
import { summarizeReportingObservability } from "@/lib/reporting/health";
import { createClient } from "@/lib/supabase/server";

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

export default async function AnalyticsPage() {
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
  const accessState = await getFirmAccessState({
    supabase,
    firmId: primary.firm_id,
  });

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
    monthlyContentResult,
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
    supabase
      .from("content_drafts")
      .select("id, channel, status, published_at, created_at")
      .eq("firm_id", primary.firm_id)
      .gte("created_at", monthStart.toISOString()),
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

  const generatedCount = (generatedEventsResult.count ?? 0) + (regeneratedEventsResult.count ?? 0);
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

  const monthlyContent = monthlyContentResult.data ?? [];
  const monthlyLinkedInGenerated = monthlyContent.filter(
    (item) => item.channel === "linkedin",
  ).length;
  const monthlyNewsletterGenerated = monthlyContent.filter(
    (item) => item.channel === "newsletter",
  ).length;
  const monthlyLinkedInPublished = monthlyContent.filter(
    (item) => item.channel === "linkedin" && item.status === "published",
  ).length;
  const monthlyNewsletterPublished = monthlyContent.filter(
    (item) => item.channel === "newsletter" && item.status === "published",
  ).length;

  const { data: reportingRuns } = await supabase
    .from("reporting_runs")
    .select("id, status, created_at")
    .eq("firm_id", primary.firm_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const reportingRunIds = (reportingRuns ?? []).map((run) => run.id);
  const { data: reportingDeliveries } = reportingRunIds.length
    ? await supabase
        .from("reporting_deliveries")
        .select("reporting_run_id, status, attempt_count, last_error_code")
        .eq("firm_id", primary.firm_id)
        .in("reporting_run_id", reportingRunIds)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };

  const reportingObservability = summarizeReportingObservability({
    runs: reportingRuns ?? [],
    deliveries: reportingDeliveries ?? [],
  });

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
      .limit(20),
    supabase
      .from("agent_tool_calls")
      .select("id, run_id, tool_name, status, duration_ms, created_at")
      .eq("firm_id", primary.firm_id)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const agentRunsFeed = agentRunsFeedResult.data ?? [];
  const agentToolCallsFeed = agentToolCallsFeedResult.data ?? [];

  return (
    <AppShell
      title="Analytics"
      description={`Firm: ${firm?.name ?? "Unknown"} | Performance, revenue, content, and audit visibility with narrative KPI framing.`}
      billingAccessState={accessState.ok ? accessState.accessState : "active"}
      billingAccessContext={
        accessState.ok
          ? {
              trialEndsAt: accessState.trialEndsAt,
              graceEndsAt: accessState.graceEndsAt,
            }
          : undefined
      }
      currentPath="/analytics"
      mobileCta={{ href: "/dashboard", label: "Open Command Center" }}
      headerActions={
        <>
          <Link
            href="/api/audit/export?format=json&days=30"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-xs font-medium rounded hover:text-indigo-700 hover:bg-white transition-all uppercase tracking-wider"
          >
            Export JSON (30d)
          </Link>
          <Link
            href="/api/audit/export?format=csv&days=30"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-xs font-medium rounded hover:text-indigo-700 hover:bg-white transition-all uppercase tracking-wider ml-2"
          >
            Export CSV (30d)
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-[#EBE8E0] bg-[#FDFCFB] text-[#2C2A26] text-xs font-medium rounded hover:bg-white transition-all uppercase tracking-wider ml-2 shadow-sm"
          >
            Dashboard
          </Link>
        </>
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <section className="mt-6 grid gap-6 md:grid-cols-4 stagger-children">
          <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-6 py-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Drafts generated</p>
            <p className="mt-2 text-3xl font-light text-[#2C2A26] tracking-tight">{funnel.generated}</p>
          </article>
          <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-6 py-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Sent</p>
            <p className="mt-2 text-3xl font-light text-[#2C2A26] tracking-tight">{funnel.sent}</p>
          </article>
          <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-6 py-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Meetings</p>
            <p className="mt-2 text-3xl font-light text-[#2C2A26] tracking-tight">{funnel.meeting}</p>
          </article>
          <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-6 py-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Wins</p>
            <p className="mt-2 text-3xl font-light text-[#2C2A26] tracking-tight">{funnel.won}</p>
          </article>
        </section>

        <section className="mt-6 rounded border border-indigo-100 bg-indigo-50/30 p-5 text-sm">
          <p className="text-[10px] uppercase tracking-widest text-indigo-800 font-medium">KPI narrative</p>
          <p className="mt-2 text-[#4338ca] leading-relaxed">
            Approval rate reflects draft quality, send rate reflects operational throughput, and meeting/win rates
            reflect conversion quality. Use these together before changing targeting or messaging strategy.
          </p>
        </section>

        <section id="pipeline-performance" className="mt-12 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Pipeline Performance</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Conversion performance from outreach generation to won opportunities.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">Approval rate</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{funnel.approvedRate}%</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">Send rate</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{funnel.sentRateFromApproved}%</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">Reply rate</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{funnel.replyRateFromSent}%</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">Meeting rate</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{funnel.meetingRateFromSent}%</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">Win rate</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{funnel.winRateFromSent}%</p>
            </article>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Follow-ups due</p>
                <p className="mt-1 text-xl font-light text-[#2C2A26] tracking-tight">{dueFollowUps}</p>
              </div>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Pipeline: Meeting</p>
                <p className="mt-1 text-xl font-light text-[#2C2A26] tracking-tight">{stageCounts.meeting}</p>
              </div>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Pipeline: Won</p>
                <p className="mt-1 text-xl font-light text-[#2C2A26] tracking-tight">{stageCounts.won}</p>
              </div>
            </article>
          </div>
        </section>

        <section id="revenue-intelligence" className="mt-14 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Revenue Intelligence</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Subscription health and outcome proxies while deeper attribution is being rolled out.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Subscription status</p>
              <p className={billingIsActive ? "mt-2 text-lg font-medium text-emerald-700" : "mt-2 text-lg font-medium text-amber-700"}>
                {billingStatus ?? "inactive"}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Plan</p>
              <p className="mt-2 text-lg font-medium text-[#2C2A26]">{billingPlanLabel}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Period end</p>
              <p className="mt-2 text-sm font-medium text-[#716E68]">
                {billingPeriodEnd ? new Date(billingPeriodEnd).toLocaleDateString() : "-"}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Auto-renew</p>
              <p className="mt-2 text-sm font-medium text-[#716E68]">
                {billingCancelAtPeriodEnd ? "Cancels at period end" : "On"}
              </p>
            </article>
          </div>
        </section>

        <section id="content-performance" className="mt-14 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Content Performance</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Channel output and publication cadence for this month.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Published (month)</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{publishedContentThisMonth}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">LinkedIn generated</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{monthlyLinkedInGenerated}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">LinkedIn published</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{monthlyLinkedInPublished}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Newsletter generated</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{monthlyNewsletterGenerated}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Newsletter published</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{monthlyNewsletterPublished}</p>
            </article>
          </div>
        </section>

        <section id="reporting-observability" className="mt-14 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Reporting Observability</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Delivery reliability indicators for the latest weekly reporting digest run.
          </p>

          <div
            className={
              reportingObservability.degraded
                ? "mt-6 rounded border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm"
                : "mt-6 rounded border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-sm"
            }
          >
            <p className="text-[10px] uppercase tracking-widest font-medium">Status</p>
            <p className="mt-1 font-medium">
              {reportingObservability.degraded
                ? "Degraded: failures detected in the latest reporting delivery path."
                : "Healthy: latest reporting run has no delivery failures."}
            </p>
            <p className="mt-1 text-xs opacity-90">{reportingObservability.actionHint}</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Last run at</p>
              <p className="mt-2 text-sm font-medium text-[#716E68]">
                {reportingObservability.lastRunAt
                  ? new Date(reportingObservability.lastRunAt).toLocaleString()
                  : "No reporting runs yet"}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Sent (last run)</p>
              <p className="mt-2 text-2xl font-light text-[#2C2A26] tracking-tight">{reportingObservability.sentCount}</p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Failed (last run)</p>
              <p
                className={
                  reportingObservability.failedCount > 0
                    ? "mt-2 text-2xl font-medium text-amber-600 tracking-tight"
                    : "mt-2 text-2xl font-light text-[#2C2A26] tracking-tight"
                }
              >
                {reportingObservability.failedCount}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Retries exhausted</p>
              <p
                className={
                  reportingObservability.maxAttemptsReachedCount > 0
                    ? "mt-2 text-2xl font-medium text-amber-600 tracking-tight"
                    : "mt-2 text-2xl font-light text-[#2C2A26] tracking-tight"
                }
              >
                {reportingObservability.maxAttemptsReachedCount}
              </p>
            </article>
            <article className="rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Config failures</p>
              <p
                className={
                  reportingObservability.configFailureCount > 0
                    ? "mt-2 text-2xl font-medium text-amber-600 tracking-tight"
                    : "mt-2 text-2xl font-light text-[#2C2A26] tracking-tight"
                }
              >
                {reportingObservability.configFailureCount}
              </p>
            </article>
          </div>

          <article className="mt-4 rounded border border-[#EBE8E0] bg-[#FDFCFB] px-5 py-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Top error codes (last run)</p>
            <div className="mt-3 space-y-1 text-sm text-[#716E68]">
              {reportingObservability.topErrorCodes.length ? (
                reportingObservability.topErrorCodes.map((item) => (
                  <p key={`analytics-reporting-error-${item.code}`}>
                    <span className="font-medium text-[#2C2A26]">{item.code}:</span> {item.count}
                  </p>
                ))
              ) : (
                <p className="text-[#A19D94]">No delivery failures recorded in the latest run.</p>
              )}
            </div>
          </article>
        </section>

        <section id="agent-activity" className="mt-14 bg-transparent reveal-up">
          <div className="flex items-center justify-between border-b border-[#F7F6F2] pb-4 mb-6">
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Agent Activity Log</h2>
          </div>
          <p className="text-sm text-[#716E68]">
            Last 30 days of orchestrator runs and tool calls.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <article className="rounded border border-[#EBE8E0] bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-[#2C2A26] border-b border-[#EBE8E0] pb-3 mb-4">Recent runs</p>
              <div className="space-y-3">
                {agentRunsFeed.slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 text-xs flex flex-col hover:border-[#EBE8E0] transition-colors">
                    <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">{run.run_type}</p>
                    <p className="mt-1 font-medium text-[#2C2A26] capitalize">{run.status}</p>
                    <p className="mt-1 text-[#716E68] text-[11px]">{new Date(run.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {!agentRunsFeed.length ? (
                  <div className="py-8 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded bg-[#FDFCFB]">
                     <p className="text-sm text-[#716E68] italic">No agent runs recorded in the selected window.</p>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="rounded border border-[#EBE8E0] bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-[#2C2A26] border-b border-[#EBE8E0] pb-3 mb-4">Recent tool calls</p>
              <div className="space-y-3">
                {agentToolCallsFeed.slice(0, 10).map((call) => (
                  <div key={call.id} className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 text-xs flex flex-col hover:border-[#EBE8E0] transition-colors">
                    <p className="text-[10px] uppercase tracking-widest text-indigo-700 font-medium">{call.tool_name}</p>
                    <p className="mt-1 font-medium text-[#2C2A26] capitalize">{call.status}</p>
                    <p className="mt-1 text-[#716E68] text-[11px]">
                      {call.duration_ms ? `${call.duration_ms}ms` : "duration unknown"} |{" "}
                      {new Date(call.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {!agentToolCallsFeed.length ? (
                  <div className="py-8 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded bg-[#FDFCFB]">
                     <p className="text-sm text-[#716E68] italic">No tool calls recorded in the selected window.</p>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
