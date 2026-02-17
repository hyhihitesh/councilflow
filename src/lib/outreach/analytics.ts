export type OutreachEventRow = {
  action_type: "generated" | "approved" | "edited" | "regenerated" | "skipped" | "sent";
  created_at: string;
};

export type OutreachAnalyticsSummary = {
  generated: number;
  approved: number;
  sent: number;
  skipped: number;
  approvalRate: number;
  sendRateFromApproved: number;
};

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

export function summarizeOutreachEvents(events: OutreachEventRow[]): OutreachAnalyticsSummary {
  const summary = {
    generated: 0,
    approved: 0,
    sent: 0,
    skipped: 0,
    approvalRate: 0,
    sendRateFromApproved: 0,
  };

  for (const event of events) {
    if (event.action_type === "generated" || event.action_type === "regenerated") summary.generated += 1;
    if (event.action_type === "approved") summary.approved += 1;
    if (event.action_type === "sent") summary.sent += 1;
    if (event.action_type === "skipped") summary.skipped += 1;
  }

  summary.approvalRate = summary.generated > 0 ? roundPercent((summary.approved / summary.generated) * 100) : 0;
  summary.sendRateFromApproved =
    summary.approved > 0 ? roundPercent((summary.sent / summary.approved) * 100) : 0;

  return summary;
}
