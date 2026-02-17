export type ContentChannel = "linkedin" | "newsletter";

export type GeneratedContentDraft = {
  channel: ContentChannel;
  title: string;
  body: string;
  preview_payload: Record<string, unknown>;
};

function normalizeTopic(topic: string | null | undefined) {
  const value = (topic ?? "").trim();
  return value.length > 0 ? value : "business development for law firms";
}

function linkedinDraft(topic: string): GeneratedContentDraft {
  const title = `LinkedIn: ${topic}`;
  const body = [
    "Law firm growth is no longer just about volume. It is about timing and precision.",
    "",
    `This week we focused on ${topic}:`,
    "- identifying high-intent signals before competitors react",
    "- tailoring outreach to stakeholder priorities",
    "- reducing follow-up lag with a structured pipeline",
    "",
    "If you are running BD inside a legal team, where is your current bottleneck: discovery, messaging, or follow-through?",
    "",
    "#LegalOps #LawFirmGrowth #BusinessDevelopment #LegalTechnology",
  ].join("\n");

  return {
    channel: "linkedin",
    title,
    body,
    preview_payload: {
      cta: "Ask a direct question to drive comments.",
      hashtag_count: 4,
    },
  };
}

function newsletterDraft(topic: string): GeneratedContentDraft {
  const title = `Monthly Brief: ${topic}`;
  const body = [
    "Opening",
    `This month we observed a clear pattern around ${topic}: teams that run a consistent review cadence outperform reactive outreach motions.`,
    "",
    "What changed",
    "1. More firms are prioritizing account-level trigger monitoring.",
    "2. Approval-to-send cycle times are shrinking with better draft governance.",
    "3. Follow-up discipline is becoming a leading indicator of booked meetings.",
    "",
    "How to apply this",
    "- Set one weekly review block for top prospects.",
    "- Keep one approved outreach template per segment.",
    "- Define next-action ownership for every sent message.",
    "",
    "Closing",
    "Reply to this brief if you want a practical checklist you can roll out in one week.",
  ].join("\n\n");

  return {
    channel: "newsletter",
    title,
    body,
    preview_payload: {
      sections: ["Opening", "What changed", "How to apply this", "Closing"],
      estimated_read_minutes: 3,
    },
  };
}

export function generateContentDraft(input: {
  channel: ContentChannel;
  topic?: string | null;
}) {
  const topic = normalizeTopic(input.topic);

  if (input.channel === "linkedin") {
    return linkedinDraft(topic);
  }

  return newsletterDraft(topic);
}
