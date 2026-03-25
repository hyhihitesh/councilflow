import Link from "next/link";

import { PipelineBoard } from "@/app/pipeline/pipeline-board";
import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { buildThreadSummaryFromEvents } from "@/lib/pipeline/thread-summary";
import { requireAuth } from "@/lib/auth/require-auth";

type SearchParams = {
  error?: string;
  message?: string;
};

type CalendarMarker = {
  id: string;
  prospect_id: string;
  provider: string;
  external_event_id: string;
  status: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  meeting_url: string | null;
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase, user, firmId, firmName } = await requireAuth();

  const firm = firmName ? { name: firmName } : null;
  const accessState = await getFirmAccessState({ supabase, firmId });

  const [{ data: prospects }, { data: tasks }, { data: outreachEvents }, { data: mailboxEvents }, { data: calendarEvents }] =
    await Promise.all([
      supabase
        .from("prospects")
        .select(
          "id, company_name, domain, pipeline_stage, fit_score, next_follow_up_at, is_hot_lead, hot_lead_reason, last_opened_at, last_replied_at",
        )
        .eq("firm_id", firmId)
        .order("updated_at", { ascending: false })
        .limit(150),
      supabase
        .from("follow_up_tasks")
        .select("id, prospect_id, stage, due_at, status, subject, body, created_at")
        .eq("firm_id", firmId)
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(50),
      supabase
        .from("outreach_events")
        .select("id, prospect_id, action_type, metadata, created_at")
        .eq("firm_id", firmId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("message_events")
        .select("id, prospect_id, event_type, event_occurred_at, payload")
        .eq("firm_id", firmId)
        .order("event_occurred_at", { ascending: false })
        .limit(300),
      supabase
        .from("calendar_events")
        .select("id, prospect_id, provider, external_event_id, status, title, starts_at, ends_at, meeting_url")
        .eq("firm_id", firmId)
        .order("starts_at", { ascending: false })
        .limit(200),
    ]);

  const threadSummaryByProspect: Record<string, ReturnType<typeof buildThreadSummaryFromEvents>> = {};

  const allProspectIds = Array.from(
    new Set((prospects ?? []).map((prospect) => prospect.id)),
  );

  for (const prospectId of allProspectIds) {
    const summary = buildThreadSummaryFromEvents({
      outreachEvents: (outreachEvents ?? [])
        .filter((event) => event.prospect_id === prospectId)
        .map((event) => ({
          id: event.id,
          action_type: event.action_type,
          created_at: event.created_at,
          metadata:
            event.metadata && typeof event.metadata === "object"
              ? (event.metadata as Record<string, unknown>)
              : null,
        })),
      mailboxEvents: (mailboxEvents ?? [])
        .filter((event) => event.prospect_id === prospectId)
        .map((event) => ({
          id: event.id,
          event_type: event.event_type,
          event_occurred_at: event.event_occurred_at,
          payload:
            event.payload && typeof event.payload === "object"
              ? (event.payload as Record<string, unknown>)
              : null,
        })),
    });

    threadSummaryByProspect[prospectId] = summary;
  }

  const calendarByProspect = Object.fromEntries(
    (calendarEvents ?? []).map((event) => [event.prospect_id, event]),
  ) as Record<string, CalendarMarker>;

  return (
    <AppShell
      title="Follow-Up Pipeline"
      description={`Firm: ${firm?.name ?? "Unknown"}`}
      userEmail={user.email}
      billingAccessState={accessState.ok ? accessState.accessState : "active"}
      billingAccessContext={
        accessState.ok
          ? {
              trialEndsAt: accessState.trialEndsAt,
              graceEndsAt: accessState.graceEndsAt,
            }
          : undefined
      }
      currentPath="/pipeline"
      headerActions={
        <>
          <form action="/api/follow-ups/generate" method="post">
            <button type="submit" className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors uppercase tracking-widest shadow-sm">
              Generate due follow-ups
            </button>
          </form>
          <Link href="/dashboard" className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest">
            Dashboard
          </Link>
        </>
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {params.error ? <p className="mt-4 alert-error">{params.error}</p> : null}
        {params.message ? <p className="mt-4 alert-success">{params.message}</p> : null}

        <PipelineBoard
          initialProspects={(prospects ?? []) as Parameters<typeof PipelineBoard>[0]["initialProspects"]}
          tasks={(tasks ?? []) as Parameters<typeof PipelineBoard>[0]["tasks"]}
          threadSummaryByProspect={threadSummaryByProspect}
          calendarByProspect={calendarByProspect}
        />
      </div>
    </AppShell>
  );
}
