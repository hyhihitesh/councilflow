import type { WeeklyReportingMetrics } from "@/lib/reporting/aggregate";

export type WeeklyDigestPayload = {
  title: string;
  summary: string;
  highlights: string[];
  risks: string[];
  generated_at: string;
  week_start: string;
  week_end: string;
  metrics: WeeklyReportingMetrics;
};

function toDeltaLabel(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function composeWeeklyDigest(input: {
  firmName: string;
  weekStart: string;
  weekEnd: string;
  generatedAt?: string;
  metrics: WeeklyReportingMetrics;
}): WeeklyDigestPayload {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const { metrics } = input;

  const summary =
    `${input.firmName} weekly digest: ${metrics.funnel.sent} outreach sends, ` +
    `${metrics.funnel.replied} reply-stage opportunities, and ${metrics.funnel.won} wins in pipeline.`;

  const highlights = [
    `Approval rate: ${metrics.funnel.approvedRate}% (${metrics.approved}/${metrics.generated})`,
    `Send rate from approved: ${metrics.funnel.sentRateFromApproved}% (${metrics.sent}/${metrics.approved})`,
    `Reply rate from sent: ${metrics.funnel.replyRateFromSent}% (${metrics.funnel.replied}/${metrics.sent})`,
    `Published content this period: ${metrics.publishedContent}`,
    `Completed follow-ups this period: ${metrics.completedFollowUps}`,
  ];

  const risks = [
    `Pending follow-ups due: ${metrics.dueFollowUps}`,
    `Research failures this period: ${metrics.researchFailedRuns}`,
    `Net pipeline wins vs losses: ${toDeltaLabel(metrics.stageCounts.won - metrics.stageCounts.lost)}`,
  ];

  return {
    title: `Weekly Digest (${input.weekStart} to ${input.weekEnd})`,
    summary,
    highlights,
    risks,
    generated_at: generatedAt,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    metrics,
  };
}
