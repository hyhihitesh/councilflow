export type PipelineStage =
  | "researched"
  | "approved"
  | "sent"
  | "replied"
  | "meeting"
  | "won"
  | "lost";

export type FollowUpRule = {
  stage: PipelineStage;
  delayDays: number;
  subjectPrefix: string;
};

const RULES: Record<PipelineStage, FollowUpRule> = {
  researched: {
    stage: "researched",
    delayDays: 0,
    subjectPrefix: "Research update",
  },
  approved: {
    stage: "approved",
    delayDays: 0,
    subjectPrefix: "Ready to send",
  },
  sent: {
    stage: "sent",
    delayDays: 3,
    subjectPrefix: "Follow-up",
  },
  replied: {
    stage: "replied",
    delayDays: 2,
    subjectPrefix: "Reply follow-up",
  },
  meeting: {
    stage: "meeting",
    delayDays: 7,
    subjectPrefix: "Post-meeting",
  },
  won: {
    stage: "won",
    delayDays: 0,
    subjectPrefix: "Won",
  },
  lost: {
    stage: "lost",
    delayDays: 0,
    subjectPrefix: "Lost",
  },
};

const FOLLOW_UP_ELIGIBLE = new Set<PipelineStage>(["sent", "replied", "meeting"]);

export function getFollowUpRule(stage: PipelineStage) {
  return RULES[stage];
}

export function isFollowUpEligible(stage: PipelineStage) {
  return FOLLOW_UP_ELIGIBLE.has(stage);
}

export function computeNextFollowUpAt(stage: PipelineStage, base = new Date()) {
  const rule = getFollowUpRule(stage);
  if (!isFollowUpEligible(stage) || rule.delayDays <= 0) return null;

  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + rule.delayDays);
  return next.toISOString();
}

export function buildFollowUpSuggestion(input: {
  companyName: string;
  stage: PipelineStage;
  contactName?: string | null;
}) {
  const rule = getFollowUpRule(input.stage);
  const contact = input.contactName?.trim() || "there";
  const company = input.companyName.trim();

  const subject = `${rule.subjectPrefix}: ${company}`;
  const body =
    `Hi ${contact},\n\n` +
    `Wanted to quickly follow up on my previous note regarding ${company}. ` +
    "Happy to share a concise next-step recommendation based on your current priorities.\n\n" +
    "Would a short conversation this week be useful?\n\n" +
    "Best,\ninhumans.io Team";

  return {
    subject,
    body,
  };
}
