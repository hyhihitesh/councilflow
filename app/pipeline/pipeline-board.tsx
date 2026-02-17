"use client";

import { useMemo, useState } from "react";

import type { PipelineStage } from "@/lib/followup/rules";
import type { ThreadSummaryItem } from "@/lib/pipeline/thread-summary";

type ProspectCard = {
  id: string;
  company_name: string;
  domain: string | null;
  pipeline_stage: PipelineStage;
  fit_score: number | null;
  next_follow_up_at: string | null;
  is_hot_lead: boolean;
  hot_lead_reason: string | null;
  last_opened_at: string | null;
  last_replied_at: string | null;
};

type FollowUpTask = {
  id: string;
  prospect_id: string;
  stage: PipelineStage;
  due_at: string;
  status: string;
  subject: string;
  body: string;
  created_at: string;
};

type CalendarMarker = {
  id: string;
  provider: string;
  external_event_id: string;
  status: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  meeting_url: string | null;
};

const STAGE_COLUMNS: Array<{ key: PipelineStage; label: string }> = [
  { key: "researched", label: "Researched" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "meeting", label: "Meeting" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function PipelineBoard(props: {
  initialProspects: ProspectCard[];
  tasks: FollowUpTask[];
  threadSummaryByProspect: Record<string, ThreadSummaryItem[]>;
  calendarByProspect: Record<string, CalendarMarker | undefined>;
}) {
  const [prospects, setProspects] = useState(props.initialProspects);
  const [calendarByProspect, setCalendarByProspect] = useState(props.calendarByProspect);
  const [draggingProspectId, setDraggingProspectId] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const byProspect = useMemo(
    () => new Map(prospects.map((item) => [item.id, item.company_name])),
    [prospects],
  );

  const selectedProspect = selectedProspectId
    ? prospects.find((prospect) => prospect.id === selectedProspectId) ?? null
    : null;

  const selectedThread = selectedProspectId
    ? props.threadSummaryByProspect[selectedProspectId] ?? []
    : [];

  const selectedCalendar = selectedProspectId ? calendarByProspect[selectedProspectId] : undefined;

  async function moveProspect(params: {
    prospectId: string;
    toStage: PipelineStage;
    source: "drag_drop" | "drawer_action";
    meeting?: {
      title: string;
      starts_at: string;
      ends_at: string;
      description?: string;
      attendees?: string[];
    };
  }) {
    const existing = prospects.find((prospect) => prospect.id === params.prospectId);
    if (!existing) return;

    if (existing.pipeline_stage === params.toStage) return;

    const previous = prospects;
    setSavingMove(true);
    setFeedback(null);
    setFeedbackError(null);

    setProspects((current) =>
      current.map((prospect) =>
        prospect.id === params.prospectId ? { ...prospect, pipeline_stage: params.toStage } : prospect,
      ),
    );

    try {
      const response = await fetch("/api/pipeline/stage-move", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prospect_id: params.prospectId,
          to_stage: params.toStage,
          source: params.source,
          meeting: params.meeting,
        }),
      });

      const payload = (await response.json()) as {
        data?: {
          auto_calendar?: {
            created?: boolean;
            error_code?: string;
            error_message?: string;
          };
        };
        error?: { message?: string };
      };

      if (!response.ok) {
        setProspects(previous);
        setFeedbackError(payload.error?.message ?? "Failed to move stage");
        return;
      }

      const autoCalendar = payload.data?.auto_calendar;
      if (autoCalendar?.created) {
        setFeedback("Stage moved and meeting event created.");
      } else if (autoCalendar?.error_code) {
        setFeedback(`Stage moved, but calendar auto-create failed: ${autoCalendar.error_message ?? autoCalendar.error_code}`);
      } else {
        setFeedback("Stage updated.");
      }
    } catch (error) {
      setProspects(previous);
      setFeedbackError(error instanceof Error ? error.message : "Failed to move stage");
    } finally {
      setSavingMove(false);
    }
  }

  async function createMeetingEvent(prospectId: string) {
    if (!meetingTitle || !meetingStart || !meetingEnd) {
      setFeedbackError("Meeting title, start, and end are required.");
      return;
    }

    setCreatingMeeting(true);
    setFeedback(null);
    setFeedbackError(null);

    try {
      const response = await fetch("/api/calendar/events/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prospect_id: prospectId,
          title: meetingTitle,
          starts_at: new Date(meetingStart).toISOString(),
          ends_at: new Date(meetingEnd).toISOString(),
          description: meetingDescription || undefined,
          attendees: meetingAttendees || undefined,
        }),
      });

      const payload = (await response.json()) as {
        data?: {
          event?: {
            id: string;
            provider: string;
            external_event_id: string;
            status: string;
            title: string | null;
            starts_at: string;
            ends_at: string;
            meeting_url: string | null;
          };
          duplicate?: boolean;
        };
        error?: { message?: string };
      };

      if (!response.ok) {
        setFeedbackError(payload.error?.message ?? "Failed to create meeting event");
        return;
      }

      const event = payload.data?.event;
      if (event) {
        setCalendarByProspect((current) => ({
          ...current,
          [prospectId]: event,
        }));
      }

      setProspects((current) =>
        current.map((prospect) =>
          prospect.id === prospectId
            ? {
                ...prospect,
                pipeline_stage: "meeting",
              }
            : prospect,
        ),
      );

      setFeedback(payload.data?.duplicate ? "Meeting event already linked." : "Meeting event created.");
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "Failed to create meeting event");
    } finally {
      setCreatingMeeting(false);
    }
  }

  return (
    <>
      {feedbackError ? <p className="mt-4 alert-error">{feedbackError}</p> : null}
      {feedback ? <p className="mt-4 alert-success">{feedback}</p> : null}

      <section className="mt-6 overflow-x-auto pb-2 reveal-up">
        <div className="grid min-w-[1120px] grid-cols-7 gap-3 stagger-children">
          {STAGE_COLUMNS.map((column) => {
            const stageProspects = prospects.filter((prospect) => prospect.pipeline_stage === column.key);

            return (
              <article
                key={column.key}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingProspectId) return;
                  void moveProspect({
                    prospectId: draggingProspectId,
                    toStage: column.key,
                    source: "drag_drop",
                  });
                  setDraggingProspectId(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#CBD5E1]">
                    {column.label}
                  </h2>
                  <span className="rounded-full bg-[#111827] px-2 py-0.5 text-xs text-[#94A3B8]">
                    {stageProspects.length}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {stageProspects.slice(0, 20).map((prospect) => {
                    const linkedMeeting = calendarByProspect[prospect.id];

                    return (
                      <button
                        key={prospect.id}
                        draggable={!savingMove}
                        onDragStart={() => setDraggingProspectId(prospect.id)}
                        onDragEnd={() => setDraggingProspectId(null)}
                        onClick={() => setSelectedProspectId(prospect.id)}
                        className="w-full rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2 text-left"
                        type="button"
                      >
                        <p className="text-sm font-medium">{prospect.company_name}</p>
                        {prospect.is_hot_lead ? (
                          <p className="mt-1 inline-flex rounded-full border border-rose-300/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-rose-200">
                            Hot lead{prospect.hot_lead_reason ? ` | ${prospect.hot_lead_reason}` : ""}
                          </p>
                        ) : null}
                        {linkedMeeting ? (
                          <p className="mt-1 inline-flex rounded-full border border-indigo-300/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-indigo-200">
                            Meeting linked
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-[#94A3B8]">{prospect.domain ?? "No domain"}</p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          Fit: {prospect.fit_score ?? "-"}
                          {prospect.next_follow_up_at
                            ? ` | Next follow-up ${new Date(prospect.next_follow_up_at).toLocaleDateString()}`
                            : ""}
                        </p>
                      </button>
                    );
                  })}

                  {!stageProspects.length ? (
                    <p className="rounded-lg border border-dashed border-white/15 bg-[#0D1117] px-3 py-2 text-xs text-[#94A3B8]">
                      No prospects in this stage.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 glass-card p-5 reveal-up">
        <h2 className="text-xl font-medium">Follow-Up Queue</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">Tasks generated from timing rules after outreach activity.</p>

        <div className="mt-4 table-shell">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0D1117] text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3 font-medium">Prospect</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.tasks.map((task) => (
                <tr key={task.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3">{byProspect.get(task.prospect_id) ?? task.prospect_id}</td>
                  <td className="px-4 py-3">{new Date(task.due_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{task.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[#94A3B8]">{task.body}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{task.stage}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <form action="/api/follow-ups/decision" method="post">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="action" value="complete" />
                        <button
                          type="submit"
                          className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                        >
                          Mark complete
                        </button>
                      </form>
                      <form action="/api/follow-ups/decision" method="post">
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="action" value="skip" />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-300/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200"
                        >
                          Skip
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!props.tasks.length ? (
                <tr className="border-t border-white/10">
                  <td className="px-4 py-6 text-sm text-[#94A3B8]" colSpan={5}>
                    No pending follow-ups. Generate due follow-ups to populate the queue.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedProspect ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/15 bg-[#0B1220] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{selectedProspect.company_name}</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">{selectedProspect.domain ?? "No domain"}</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-white/20 bg-[#111827] px-3 py-1.5 text-xs"
                onClick={() => setSelectedProspectId(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-[#0D1117] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#94A3B8]">Stage</p>
              <p className="mt-2 text-sm font-medium capitalize">{selectedProspect.pipeline_stage}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STAGE_COLUMNS.map((stage) => (
                  <button
                    key={`drawer-stage-${stage.key}`}
                    type="button"
                    className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200"
                    onClick={() => {
                      const meetingPayload =
                        stage.key === "meeting" && meetingTitle && meetingStart && meetingEnd
                          ? {
                              title: meetingTitle,
                              starts_at: new Date(meetingStart).toISOString(),
                              ends_at: new Date(meetingEnd).toISOString(),
                              description: meetingDescription || undefined,
                              attendees: meetingAttendees
                                ? meetingAttendees.split(",").map((item) => item.trim()).filter(Boolean)
                                : undefined,
                            }
                          : undefined;

                      void moveProspect({
                        prospectId: selectedProspect.id,
                        toStage: stage.key,
                        source: "drawer_action",
                        meeting: meetingPayload,
                      });
                    }}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-[#0D1117] p-4">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#CBD5E1]">Meeting sync</h4>
              {selectedCalendar ? (
                <div className="mt-3 space-y-2 text-sm text-[#CBD5E1]">
                  <p>Status: <span className="capitalize">{selectedCalendar.status}</span></p>
                  <p>Starts: {formatDateTime(selectedCalendar.starts_at)}</p>
                  <p>Ends: {formatDateTime(selectedCalendar.ends_at)}</p>
                  {selectedCalendar.meeting_url ? (
                    <a
                      className="inline-block rounded-md border border-indigo-300/40 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200"
                      href={selectedCalendar.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open meeting link
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 grid gap-2 text-sm">
                  <input
                    className="input-base"
                    placeholder="Meeting title"
                    value={meetingTitle}
                    onChange={(event) => setMeetingTitle(event.target.value)}
                  />
                  <input
                    className="input-base"
                    type="datetime-local"
                    value={meetingStart}
                    onChange={(event) => setMeetingStart(event.target.value)}
                  />
                  <input
                    className="input-base"
                    type="datetime-local"
                    value={meetingEnd}
                    onChange={(event) => setMeetingEnd(event.target.value)}
                  />
                  <textarea
                    className="input-base min-h-20"
                    placeholder="Meeting description"
                    value={meetingDescription}
                    onChange={(event) => setMeetingDescription(event.target.value)}
                  />
                  <input
                    className="input-base"
                    placeholder="Attendees (comma-separated emails)"
                    value={meetingAttendees}
                    onChange={(event) => setMeetingAttendees(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-md border border-indigo-300/40 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200"
                    onClick={() => void createMeetingEvent(selectedProspect.id)}
                    disabled={creatingMeeting}
                  >
                    {creatingMeeting ? "Creating..." : "Create calendar event"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-[#0D1117] p-4">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#CBD5E1]">Thread summary</h4>
              <div className="mt-3 space-y-2">
                {selectedThread.map((item) => (
                  <article key={item.id} className="rounded-md border border-white/10 bg-[#101827] p-3">
                    <p className="text-xs uppercase tracking-[0.08em] text-[#94A3B8]">
                      {item.source} | {item.eventType}
                    </p>
                    <p className="mt-1 text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-[#CBD5E1]">{item.description}</p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">{formatDateTime(item.happenedAt)}</p>
                  </article>
                ))}
                {!selectedThread.length ? (
                  <p className="text-xs text-[#94A3B8]">No thread events yet.</p>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
