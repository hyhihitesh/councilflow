import { type PipelineStage } from "@/lib/followup/rules";

export type StageCounts = Record<PipelineStage, number>;

export type FunnelMetrics = {
  generated: number;
  approved: number;
  sent: number;
  replied: number;
  meeting: number;
  won: number;
  approvedRate: number;
  sentRateFromApproved: number;
  replyRateFromSent: number;
  meetingRateFromSent: number;
  winRateFromSent: number;
};

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

export function toPercent(part: number, total: number) {
  if (total <= 0) return 0;
  return roundPercent((part / total) * 100);
}

export function buildFunnelMetrics(input: {
  generated: number;
  approved: number;
  sent: number;
  stageCounts: StageCounts;
}): FunnelMetrics {
  const replied =
    input.stageCounts.replied + input.stageCounts.meeting + input.stageCounts.won;
  const meeting = input.stageCounts.meeting + input.stageCounts.won;
  const won = input.stageCounts.won;

  return {
    generated: input.generated,
    approved: input.approved,
    sent: input.sent,
    replied,
    meeting,
    won,
    approvedRate: toPercent(input.approved, input.generated),
    sentRateFromApproved: toPercent(input.sent, input.approved),
    replyRateFromSent: toPercent(replied, input.sent),
    meetingRateFromSent: toPercent(meeting, input.sent),
    winRateFromSent: toPercent(won, input.sent),
  };
}
