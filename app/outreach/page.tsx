import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { summarizeOutreachEvents } from "@/lib/outreach/analytics";
import { evaluateOutreachCompliance } from "@/lib/outreach/compliance";
import { requireAuth } from "@/lib/auth/require-auth";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase, user, firmId, firmName } = await requireAuth();

  const firm = firmName ? { name: firmName } : null;
  const accessState = await getFirmAccessState({ supabase, firmId });

  // Parallel fetch of independent data
  const [{ data: prospects }] = await Promise.all([
    supabase
      .from("prospects")
      .select("id, company_name, domain, status, fit_score")
      .eq("firm_id", firmId)
      .order("fit_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const prospectIds = (prospects ?? []).map((prospect) => prospect.id);
  const { data: drafts } = prospectIds.length
      ? await supabase
        .from("outreach_drafts")
        .select("id, prospect_id, variant, status, subject, body, voice_score, version, sent_at, created_at")
        .eq("firm_id", firmId)
        .in("prospect_id", prospectIds)
        .order("version", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: events } = await supabase
    .from("outreach_events")
    .select("id, action_type, prospect_id, created_at, metadata")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(40);

  const analytics = summarizeOutreachEvents(
    (events ?? []).map((event) => ({
      action_type: event.action_type,
      created_at: event.created_at,
    })),
  );

  const draftsByProspect = new Map<string, typeof drafts>();
  for (const draft of drafts ?? []) {
    const list = draftsByProspect.get(draft.prospect_id) ?? [];
    list.push(draft);
    draftsByProspect.set(draft.prospect_id, list);
  }
  const prospectNameById = new Map((prospects ?? []).map((prospect) => [prospect.id, prospect.company_name]));

  function complianceBadgeClass(status: "pass" | "warning" | "fail") {
    if (status === "pass") return "border-emerald-300/40 bg-emerald-500/10 text-emerald-200";
    if (status === "warning") return "border-amber-300/40 bg-amber-500/10 text-amber-200";
    return "border-red-300/40 bg-red-500/10 text-red-200";
  }

  return (
    <AppShell
      title="Outreach Writer"
      description={`Firm: ${firm?.name ?? "Unknown"} | Generate, review, and approve drafts before send.`}
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
      currentPath="/outreach"
      headerActions={
        <>
          <Link
            href="/pipeline"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Pipeline
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded-sm hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-widest"
          >
            Dashboard
          </Link>
        </>
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {params.error ? (
          <p className="mt-4 alert-error">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="mt-4 alert-success">
            {params.message}
          </p>
        ) : null}

        <section className="mt-6 grid gap-6 reveal-up">
          <div className="grid gap-4 md:grid-cols-4 stagger-children">
            <div className="bg-white border border-[#EBE8E0] p-6 shadow-sm rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Generated</p>
              <p className="mt-3 text-3xl font-light tracking-tight text-[#2C2A26]">{analytics.generated}</p>
            </div>
            <div className="bg-white border border-[#EBE8E0] p-6 shadow-sm rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Approved</p>
              <p className="mt-3 text-3xl font-light tracking-tight text-[#2C2A26]">{analytics.approved}</p>
            </div>
            <div className="bg-white border border-[#EBE8E0] p-6 shadow-sm rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Sent</p>
              <p className="mt-3 text-3xl font-light tracking-tight text-[#2C2A26]">{analytics.sent}</p>
            </div>
            <div className="bg-white border border-[#EBE8E0] p-6 shadow-sm rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Approval rate</p>
              <p className="mt-3 text-3xl font-light tracking-tight text-[#2C2A26]">{analytics.approvalRate}%</p>
              <p className="mt-2 text-[11px] text-[#A19D94]">
                Convert valid: {analytics.sendRateFromApproved}%
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#EBE8E0] p-6 shadow-sm rounded-sm reveal-up">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94] mb-4">
              Activity timeline
            </h2>
            <div className="space-y-3">
              {(events ?? []).slice(0, 12).map((event) => {
                const company = prospectNameById.get(event.prospect_id) ?? "Unknown prospect";
                return (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F7F6F2] pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-sm font-medium text-[#2C2A26]">
                      <span className="uppercase tracking-widest text-[#A19D94] font-semibold text-[10px]">{event.action_type}</span>{" "}
                      <span className="mx-2 text-[#EBE8E0]">—</span> {company}
                    </p>
                    <p className="text-[11px] text-[#A19D94]">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
              {!events?.length ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-[#EBE8E0] rounded">
                  <p className="text-[11px] text-[#A19D94] italic">
                    No activity yet. Generate drafts to start timeline.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {(prospects ?? []).map((prospect) => {
            const prospectDrafts = draftsByProspect.get(prospect.id) ?? [];
            const latestVersion = prospectDrafts[0]?.version ?? 0;

            return (
              <article key={prospect.id} className="bg-white border border-[#EBE8E0] p-8 shadow-sm rounded-sm reveal-up mb-6">
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#F7F6F2] pb-6 mb-6">
                  <div>
                    <h2 className="text-2xl font-light tracking-tight text-[#2C2A26]">{prospect.company_name}</h2>
                    <p className="mt-2 text-sm text-[#716E68]">
                      {prospect.domain ?? "No domain"} <span className="mx-2 text-[#EBE8E0]">|</span> {prospect.status} <span className="mx-2 text-[#EBE8E0]">|</span> Fit:{" "}
                      {prospect.fit_score ?? "-"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action="/api/outreach/drafts/generate" method="post">
                      <input type="hidden" name="firm_id" value={firmId} />
                      <input type="hidden" name="prospect_id" value={prospect.id} />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
                      >
                        Generate drafts
                      </button>
                    </form>
                    {latestVersion > 0 ? (
                      <form action="/api/outreach/drafts/generate" method="post">
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <input type="hidden" name="regenerate" value="1" />
                        <button
                          type="submit"
                          className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                        >
                          Regenerate (v{latestVersion + 1})
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  {prospectDrafts.slice(0, 3).map((draft) => (
                    <div key={draft.id} className="rounded border border-[#EBE8E0] bg-[#FDFCFB] p-6 shadow-sm flex flex-col hover:border-[#D5D1C6] transition-colors relative group">
                      {(() => {
                        const compliance = evaluateOutreachCompliance({
                          subject: draft.subject,
                          body: draft.body,
                          voiceScore: draft.voice_score,
                        });

                        return (
                          <>
                            <div className="flex items-center justify-between mb-4 border-b border-[#EBE8E0] pb-3">
                              <p className="text-[10px] uppercase tracking-widest text-[#716E68] font-medium">
                                {draft.variant.replace("_", " ")} v{draft.version}
                              </p>
                              <span className="px-2 py-0.5 rounded bg-white border border-[#EBE8E0] text-[9px] uppercase tracking-widest text-[#716E68] font-medium shadow-sm">
                                {draft.status}
                              </span>
                            </div>

                            <div className="flex-1">
                              <p className="text-sm font-medium text-[#2C2A26] leading-snug">{draft.subject}</p>
                              <p className="mt-4 whitespace-pre-wrap text-[13px] text-[#716E68] font-serif leading-relaxed">
                                {draft.body}
                              </p>
                            </div>

                            <div className="mt-6 pt-4 border-t border-[#EBE8E0]">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] uppercase tracking-widest text-[#A19D94] font-medium">Score: {draft.voice_score ?? "-"}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-medium border ${
                                    compliance.status === "pass" 
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700" 
                                      : compliance.status === "warning"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-rose-200 bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {compliance.status}
                                </span>
                              </div>
                              <ul className="mb-4 space-y-1.5 text-[10px] text-[#716E68]">
                                {compliance.checks.slice(0, 2).map((check) => (
                                  <li key={check.id} className="flex gap-2 items-start">
                                    <span className="text-[#A19D94] mt-0.5">•</span>
                                    <span>{check.message}</span>
                                  </li>
                                ))}
                              </ul>

                              <div className="flex flex-wrap gap-2 pt-2">
                                <form action="/api/outreach/drafts/decision" method="post" className="flex-1">
                                  <input type="hidden" name="firm_id" value={firmId} />
                                  <input type="hidden" name="draft_id" value={draft.id} />
                                  <input type="hidden" name="action" value="approve" />
                                  <button
                                    type="submit"
                                    className="w-full px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 transition-all uppercase tracking-wider"
                                  >
                                    Approve
                                  </button>
                                </form>
                                <form action="/api/outreach/drafts/decision" method="post" className="flex-1">
                                  <input type="hidden" name="firm_id" value={firmId} />
                                  <input type="hidden" name="draft_id" value={draft.id} />
                                  <input type="hidden" name="action" value="skip" />
                                  <button
                                    type="submit"
                                    className="w-full px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50 transition-all uppercase tracking-wider"
                                  >
                                    Skip
                                  </button>
                                </form>
                              </div>

                              {draft.status === "approved" ? (
                                <form action="/api/outreach/send" method="post" className="mt-2 text-center">
                                  <input type="hidden" name="draft_id" value={draft.id} />
                                  <button
                                    type="submit"
                                    className="px-4 py-2 mt-2 w-full bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
                                  >
                                    Send campaign now
                                  </button>
                                </form>
                              ) : null}

                              {draft.sent_at ? (
                                <p className="mt-4 text-center text-[10px] font-medium tracking-widest uppercase text-emerald-600">
                                  Sent ({new Date(draft.sent_at).toLocaleDateString()})
                                </p>
                              ) : null}
                            </div>

                            <form action="/api/outreach/drafts/decision" method="post" className="mt-4 pt-4 border-t border-dashed border-[#EBE8E0] space-y-3">
                              <p className="text-[10px] font-medium uppercase tracking-widest text-[#A19D94] mb-2">Direct Edit</p>
                              <input type="hidden" name="firm_id" value={firmId} />
                              <input type="hidden" name="draft_id" value={draft.id} />
                              <input type="hidden" name="action" value="edit" />
                              <input
                                name="subject"
                                defaultValue={draft.subject}
                                className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-sm text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors"
                                placeholder="Subject"
                              />
                              <textarea
                                name="body"
                                defaultValue={draft.body}
                                rows={6}
                                className="w-full rounded border border-[#EBE8E0] bg-white px-3 py-2 text-[13px] font-serif leading-relaxed text-[#2C2A26] focus:border-[#716E68] focus:outline-none focus:ring-1 focus:ring-[#716E68] transition-colors resize-y"
                                placeholder="Body"
                              />
                              <button
                                type="submit"
                                className="w-full px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50 transition-all uppercase tracking-wider"
                              >
                                Save edit
                              </button>
                            </form>
                          </>
                        );
                      })()}
                    </div>
                  ))}

                  {!prospectDrafts.length ? (
                    <div className="md:col-span-3 py-12 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded bg-[#FDFCFB]">
                      <p className="text-sm text-[#716E68] italic">No drafts yet for this prospect.</p>
                      <p className="mt-1 text-[11px] text-[#A19D94]">Click 'Generate drafts' to unleash the AI.</p>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!prospects?.length ? (
            <div className="py-20 flex flex-col items-center justify-center border border-dashed border-[#EBE8E0] rounded-sm bg-white shadow-sm">
              <p className="text-lg font-light text-[#2C2A26] tracking-tight">Writing room empty</p>
              <p className="mt-2 text-sm text-[#716E68]">Add prospects in the dashboard first, then return to Writer.</p>
              <Link
                href="/dashboard"
                className="mt-6 px-6 py-3 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}



