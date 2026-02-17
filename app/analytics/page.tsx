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
            className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200"
          >
            Export JSON (30d)
          </Link>
          <Link
            href="/api/audit/export?format=csv&days=30"
            className="rounded-md border border-indigo-300/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
          >
            Export CSV (30d)
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-white/20 bg-[#111827] px-3 py-2 text-xs"
          >
            Back to dashboard
          </Link>
        </>
      }
    >
      <section className="mt-6 grid gap-3 md:grid-cols-4 stagger-children">
        <article className="metric-card">
          <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Drafts generated</p>
          <p className="mt-2 text-2xl font-semibold">{funnel.generated}</p>
        </article>
        <article className="metric-card">
          <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Sent</p>
          <p className="mt-2 text-2xl font-semibold">{funnel.sent}</p>
        </article>
        <article className="metric-card">
          <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Meetings</p>
          <p className="mt-2 text-2xl font-semibold">{funnel.meeting}</p>
        </article>
        <article className="metric-card">
          <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Wins</p>
          <p className="mt-2 text-2xl font-semibold">{funnel.won}</p>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-white/10 bg-[#0D1117] p-4 text-sm text-[#CBD5E1]">
        <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">KPI narrative</p>
        <p className="mt-2">
          Approval rate reflects draft quality, send rate reflects operational throughput, and meeting/win rates
          reflect conversion quality. Use these together before changing targeting or messaging strategy.
        </p>
      </section>

      <section id="pipeline-performance" className="mt-6 glass-card p-6 reveal-up">
        <h2 className="text-xl font-medium">Pipeline Performance</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Conversion performance from outreach generation to won opportunities.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Follow-ups due</p>
            <p className="mt-2 text-2xl font-semibold">{dueFollowUps}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Pipeline stage: meeting</p>
            <p className="mt-2 text-2xl font-semibold">{stageCounts.meeting}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Pipeline stage: won</p>
            <p className="mt-2 text-2xl font-semibold">{stageCounts.won}</p>
          </article>
        </div>
      </section>

      <section id="revenue-intelligence" className="mt-6 glass-card p-6 reveal-up">
        <h2 className="text-xl font-medium">Revenue Intelligence</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Subscription health and outcome proxies while deeper attribution is being rolled out.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Subscription status</p>
            <p className={billingIsActive ? "mt-2 text-lg font-semibold text-emerald-200" : "mt-2 text-lg font-semibold text-amber-200"}>
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
      </section>

      <section id="content-performance" className="mt-6 glass-card p-6 reveal-up">
        <h2 className="text-xl font-medium">Content Performance</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Channel output and publication cadence for this month.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Published (month)</p>
            <p className="mt-2 text-2xl font-semibold">{publishedContentThisMonth}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">LinkedIn generated</p>
            <p className="mt-2 text-2xl font-semibold">{monthlyLinkedInGenerated}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">LinkedIn published</p>
            <p className="mt-2 text-2xl font-semibold">{monthlyLinkedInPublished}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Newsletter generated</p>
            <p className="mt-2 text-2xl font-semibold">{monthlyNewsletterGenerated}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Newsletter published</p>
            <p className="mt-2 text-2xl font-semibold">{monthlyNewsletterPublished}</p>
          </article>
        </div>
      </section>

      <section id="reporting-observability" className="mt-6 glass-card p-6 reveal-up">
        <h2 className="text-xl font-medium">Reporting Observability</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Delivery reliability indicators for the latest weekly reporting digest run.
        </p>

        <div
          className={
            reportingObservability.degraded
              ? "mt-4 rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              : "mt-4 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          }
        >
          <p className="text-xs uppercase tracking-[0.16em]">Status</p>
          <p className="mt-1">
            {reportingObservability.degraded
              ? "Degraded: failures detected in the latest reporting delivery path."
              : "Healthy: latest reporting run has no delivery failures."}
          </p>
          <p className="mt-1 text-xs text-[#CBD5E1]">{reportingObservability.actionHint}</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Last run at</p>
            <p className="mt-2 text-sm font-medium text-[#CBD5E1]">
              {reportingObservability.lastRunAt
                ? new Date(reportingObservability.lastRunAt).toLocaleString()
                : "No reporting runs yet"}
            </p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Sent (last run)</p>
            <p className="mt-2 text-2xl font-semibold">{reportingObservability.sentCount}</p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Failed (last run)</p>
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
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Retries exhausted</p>
            <p
              className={
                reportingObservability.maxAttemptsReachedCount > 0
                  ? "mt-2 text-2xl font-semibold text-amber-300"
                  : "mt-2 text-2xl font-semibold"
              }
            >
              {reportingObservability.maxAttemptsReachedCount}
            </p>
          </article>
          <article className="rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Config failures</p>
            <p
              className={
                reportingObservability.configFailureCount > 0
                  ? "mt-2 text-2xl font-semibold text-amber-300"
                  : "mt-2 text-2xl font-semibold"
              }
            >
              {reportingObservability.configFailureCount}
            </p>
          </article>
        </div>

        <article className="mt-4 rounded-lg border border-white/10 bg-[#0D1117] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Top error codes (last run)</p>
          <div className="mt-2 space-y-1 text-sm text-[#CBD5E1]">
            {reportingObservability.topErrorCodes.length ? (
              reportingObservability.topErrorCodes.map((item) => (
                <p key={`analytics-reporting-error-${item.code}`}>
                  {item.code}: {item.count}
                </p>
              ))
            ) : (
              <p className="text-[#94A3B8]">No delivery failures recorded in the latest run.</p>
            )}
          </div>
        </article>
      </section>

      <section id="agent-activity" className="mt-6 glass-card p-6 reveal-up">
        <h2 className="text-xl font-medium">Agent Activity Log</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Last 30 days of orchestrator runs and tool calls.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-lg border border-white/10 bg-[#0D1117] p-4">
            <p className="text-sm font-medium">Recent runs</p>
            <div className="mt-3 space-y-2">
              {agentRunsFeed.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded-md border border-white/10 px-3 py-2 text-xs">
                  <p className="uppercase tracking-[0.12em] text-[#94A3B8]">{run.run_type}</p>
                  <p className="mt-1 capitalize">{run.status}</p>
                  <p className="mt-1 text-[#94A3B8]">{new Date(run.created_at).toLocaleString()}</p>
                </div>
              ))}
              {!agentRunsFeed.length ? (
                <p className="text-sm text-[#94A3B8]">No agent runs recorded in the selected window.</p>
              ) : null}
            </div>
          </article>

          <article className="rounded-lg border border-white/10 bg-[#0D1117] p-4">
            <p className="text-sm font-medium">Recent tool calls</p>
            <div className="mt-3 space-y-2">
              {agentToolCallsFeed.slice(0, 10).map((call) => (
                <div key={call.id} className="rounded-md border border-white/10 px-3 py-2 text-xs">
                  <p className="uppercase tracking-[0.12em] text-[#94A3B8]">{call.tool_name}</p>
                  <p className="mt-1 capitalize">{call.status}</p>
                  <p className="mt-1 text-[#94A3B8]">
                    {call.duration_ms ? `${call.duration_ms}ms` : "duration unknown"} |{" "}
                    {new Date(call.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              {!agentToolCallsFeed.length ? (
                <p className="text-sm text-[#94A3B8]">No tool calls recorded in the selected window.</p>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
