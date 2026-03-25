import { createClient } from "@/lib/supabase/server";
import { buildFunnelMetrics, type StageCounts } from "@/lib/analytics/funnel";
import { PIPELINE_STAGES } from "@/lib/constants";

interface FunnelSectionProps {
  firmId: string;
}

export async function FunnelSection({ firmId }: FunnelSectionProps) {
  const supabase = await createClient();
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
    ...stageCountResults
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
    ...PIPELINE_STAGES.map((stage) =>
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firmId)
        .eq("pipeline_stage", stage)
    ),
  ]);

  const stageCounts = PIPELINE_STAGES.reduce((acc, stage, index) => {
    acc[stage] = (stageCountResults[index] as any).count ?? 0;
    return acc;
  }, {} as StageCounts);

  const generatedCount =
    ((generatedEventsResult as any).count ?? 0) + ((regeneratedEventsResult as any).count ?? 0);
  const approvedCount = (approvedEventsResult as any).count ?? 0;
  const sentCount = (sentEventsResult as any).count ?? 0;
  const dueFollowUps = (dueFollowUpsResult as any).count ?? 0;
  const publishedContentThisMonth = (publishedContentResult as any).count ?? 0;

  const funnel = buildFunnelMetrics({
    generated: generatedCount,
    approved: approvedCount,
    sent: sentCount,
    stageCounts,
  });

  return (
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
  );
}
