export type ThreadSummaryItem = {
  id: string;
  source: "outreach" | "mailbox";
  eventType: string;
  happenedAt: string;
  title: string;
  description: string;
};

export function buildThreadSummaryFromEvents(input: {
  outreachEvents: Array<{
    id: string;
    action_type: string;
    created_at: string;
    metadata?: Record<string, unknown> | null;
  }>;
  mailboxEvents: Array<{
    id: string;
    event_type: string;
    event_occurred_at: string;
    payload?: Record<string, unknown> | null;
  }>;
}) {
  const fromOutreach: ThreadSummaryItem[] = input.outreachEvents.map((event) => ({
    id: `outreach-${event.id}`,
    source: "outreach",
    eventType: event.action_type,
    happenedAt: event.created_at,
    title: `Outreach ${event.action_type}`,
    description:
      typeof event.metadata?.provider === "string"
        ? `Provider: ${event.metadata.provider}`
        : "Outreach activity logged",
  }));

  const fromMailbox: ThreadSummaryItem[] = input.mailboxEvents.map((event) => ({
    id: `mailbox-${event.id}`,
    source: "mailbox",
    eventType: event.event_type,
    happenedAt: event.event_occurred_at,
    title: event.event_type === "replied" ? "Prospect replied" : "Prospect opened message",
    description:
      typeof event.payload?.prospect_email === "string"
        ? `Contact: ${event.payload.prospect_email}`
        : "Mailbox engagement event captured",
  }));

  return [...fromOutreach, ...fromMailbox].sort(
    (a, b) => Date.parse(b.happenedAt) - Date.parse(a.happenedAt),
  );
}
