import type { SupabaseClient } from "@supabase/supabase-js";

import { buildFunnelMetrics, type StageCounts } from "@/lib/analytics/funnel";

const PIPELINE_STAGES = [
  "researched",
  "approved",
  "sent",
  "replied",
  "meeting",
  "won",
  "lost",
] as const;

type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type WeeklyReportingMetrics = {
  generated: number;
  approved: number;
  sent: number;
  dueFollowUps: number;
  completedFollowUps: number;
  publishedContent: number;
  researchCompletedRuns: number;
  researchFailedRuns: number;
  funnel: ReturnType<typeof buildFunnelMetrics>;
  stageCounts: StageCounts;
};

function toStageCounts(input: Record<PipelineStage, number>): StageCounts {
  return input;
}

export async function aggregateWeeklyReportingMetrics(params: {
  supabase: SupabaseClient;
  firmId: string;
  sinceIso: string;
  untilIso: string;
}) {
  const { supabase, firmId, sinceIso, untilIso } = params;

  const [
    generatedEventsResult,
    regeneratedEventsResult,
    approvedEventsResult,
    sentEventsResult,
    dueFollowUpsResult,
    completedFollowUpsResult,
    publishedContentResult,
    completedResearchRunsResult,
    failedResearchRunsResult,
  ] = await Promise.all([
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "generated")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "regenerated")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "approved")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
    supabase
      .from("outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("action_type", "sent")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
    supabase
      .from("follow_up_tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "pending")
      .lte("due_at", untilIso),
    supabase
      .from("follow_up_tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "completed")
      .gte("completed_at", sinceIso)
      .lte("completed_at", untilIso),
    supabase
      .from("content_drafts")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "published")
      .gte("published_at", sinceIso)
      .lte("published_at", untilIso),
    supabase
      .from("research_runs")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "completed")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
    supabase
      .from("research_runs")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "failed")
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso),
  ]);

  const countErrors = [
    generatedEventsResult.error,
    regeneratedEventsResult.error,
    approvedEventsResult.error,
    sentEventsResult.error,
    dueFollowUpsResult.error,
    completedFollowUpsResult.error,
    publishedContentResult.error,
    completedResearchRunsResult.error,
    failedResearchRunsResult.error,
  ].filter(Boolean);

  if (countErrors.length > 0) {
    throw new Error(countErrors[0]?.message ?? "Failed to aggregate reporting metrics");
  }

  const stageCountResults = await Promise.all(
    PIPELINE_STAGES.map((stage) =>
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firmId)
        .eq("pipeline_stage", stage),
    ),
  );

  const stageCountError = stageCountResults.find((result) => result.error);
  if (stageCountError?.error) {
    throw new Error(stageCountError.error.message);
  }

  const stageCounts = toStageCounts({
    researched: stageCountResults[0]?.count ?? 0,
    approved: stageCountResults[1]?.count ?? 0,
    sent: stageCountResults[2]?.count ?? 0,
    replied: stageCountResults[3]?.count ?? 0,
    meeting: stageCountResults[4]?.count ?? 0,
    won: stageCountResults[5]?.count ?? 0,
    lost: stageCountResults[6]?.count ?? 0,
  });

  const generated = (generatedEventsResult.count ?? 0) + (regeneratedEventsResult.count ?? 0);
  const approved = approvedEventsResult.count ?? 0;
  const sent = sentEventsResult.count ?? 0;

  const metrics: WeeklyReportingMetrics = {
    generated,
    approved,
    sent,
    dueFollowUps: dueFollowUpsResult.count ?? 0,
    completedFollowUps: completedFollowUpsResult.count ?? 0,
    publishedContent: publishedContentResult.count ?? 0,
    researchCompletedRuns: completedResearchRunsResult.count ?? 0,
    researchFailedRuns: failedResearchRunsResult.count ?? 0,
    stageCounts,
    funnel: buildFunnelMetrics({
      generated,
      approved,
      sent,
      stageCounts,
    }),
  };

  return metrics;
}
