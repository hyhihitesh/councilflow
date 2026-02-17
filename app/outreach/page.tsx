import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { summarizeOutreachEvents } from "@/lib/outreach/analytics";
import { evaluateOutreachCompliance } from "@/lib/outreach/compliance";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: memberships } = await supabase
    .from("firm_memberships")
    .select("firm_id, role, firms(name)")
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    redirect("/onboarding");
  }

  const primary = memberships[0];
  const firm = Array.isArray(primary.firms) ? primary.firms[0] : primary.firms;
  const accessState = await getFirmAccessState({
    supabase,
    firmId: primary.firm_id,
  });

  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, company_name, domain, status, fit_score")
    .eq("firm_id", primary.firm_id)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);

  const prospectIds = (prospects ?? []).map((prospect) => prospect.id);
  const { data: drafts } = prospectIds.length
      ? await supabase
        .from("outreach_drafts")
        .select("id, prospect_id, variant, status, subject, body, voice_score, version, sent_at, created_at")
        .eq("firm_id", primary.firm_id)
        .in("prospect_id", prospectIds)
        .order("version", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: events } = await supabase
    .from("outreach_events")
    .select("id, action_type, prospect_id, created_at, metadata")
    .eq("firm_id", primary.firm_id)
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
      mobileCta={{ href: "/pipeline", label: "Open Follow-Up Pipeline" }}
      headerActions={
        <>
          <Link
            href="/pipeline"
            className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            Open pipeline
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-white/20 bg-[#111827] px-3 py-2 text-xs"
          >
            Back to dashboard
          </Link>
        </>
      }
    >

        {params.error ? (
          <p className="mt-6 alert-error">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="mt-6 alert-success">
            {params.message}
          </p>
        ) : null}

        <section className="mt-6 grid gap-4 reveal-up">
          <div className="grid gap-3 md:grid-cols-4 stagger-children">
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Generated</p>
              <p className="mt-2 text-2xl font-semibold">{analytics.generated}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Approved</p>
              <p className="mt-2 text-2xl font-semibold">{analytics.approved}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Sent</p>
              <p className="mt-2 text-2xl font-semibold">{analytics.sent}</p>
            </div>
            <div className="metric-card">
              <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">Approval rate</p>
              <p className="mt-2 text-2xl font-semibold">{analytics.approvalRate}%</p>
              <p className="mt-1 text-[11px] text-[#94A3B8]">
                Send from approved: {analytics.sendRateFromApproved}%
              </p>
            </div>
          </div>

          <div className="glass-card p-5 reveal-up">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
              Outreach activity timeline
            </h2>
            <div className="mt-3 space-y-2">
              {(events ?? []).slice(0, 12).map((event) => {
                const company = prospectNameById.get(event.prospect_id) ?? "Unknown prospect";
                return (
                  <div
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0D1117] px-3 py-2"
                  >
                    <p className="text-sm text-[#CBD5E1]">
                      <span className="uppercase tracking-wide text-[#94A3B8]">{event.action_type}</span>{" "}
                      for {company}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
              {!events?.length ? (
                <p className="rounded-lg border border-dashed border-white/20 bg-[#0D1117] px-3 py-2 text-sm text-[#94A3B8]">
                  No outreach activity yet. Generate and review drafts to start the timeline.
                </p>
              ) : null}
            </div>
          </div>

          {(prospects ?? []).map((prospect) => {
            const prospectDrafts = draftsByProspect.get(prospect.id) ?? [];
            const latestVersion = prospectDrafts[0]?.version ?? 0;

            return (
              <article key={prospect.id} className="glass-card p-5 reveal-up">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{prospect.company_name}</h2>
                    <p className="mt-1 text-sm text-[#94A3B8]">
                      {prospect.domain ?? "No domain"} | Prospect status: {prospect.status} | Fit score:{" "}
                      {prospect.fit_score ?? "-"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action="/api/outreach/drafts/generate" method="post">
                      <input type="hidden" name="firm_id" value={primary.firm_id} />
                      <input type="hidden" name="prospect_id" value={prospect.id} />
                      <button
                        type="submit"
                        className="btn-xs btn-primary"
                      >
                        Generate 3 drafts
                      </button>
                    </form>
                    {latestVersion > 0 ? (
                      <form action="/api/outreach/drafts/generate" method="post">
                        <input type="hidden" name="firm_id" value={primary.firm_id} />
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <input type="hidden" name="regenerate" value="1" />
                        <button
                          type="submit"
                          className="btn-xs btn-ghost"
                        >
                          Regenerate (v{latestVersion + 1})
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {prospectDrafts.slice(0, 3).map((draft) => (
                    <div key={draft.id} className="rounded-xl border border-white/10 bg-[#0D1117] p-4">
                      {(() => {
                        const compliance = evaluateOutreachCompliance({
                          subject: draft.subject,
                          body: draft.body,
                          voiceScore: draft.voice_score,
                        });

                        return (
                          <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#94A3B8]">
                          {draft.variant.replace("_", " ")} | v{draft.version}
                        </p>
                        <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#CBD5E1]">
                          {draft.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${complianceBadgeClass(compliance.status)}`}
                        >
                          Compliance: {compliance.status}
                        </span>
                      </div>

                      <p className="mt-3 text-sm font-medium">{draft.subject}</p>
                      <p className="mt-2 whitespace-pre-wrap text-xs text-[#CBD5E1]">
                        {draft.body.slice(0, 360)}
                        {draft.body.length > 360 ? "..." : ""}
                      </p>
                      <p className="mt-2 text-[11px] text-[#94A3B8]">Voice score: {draft.voice_score ?? "-"}</p>
                      <ul className="mt-2 space-y-1 text-[11px] text-[#94A3B8]">
                        {compliance.checks.slice(0, 3).map((check) => (
                          <li key={check.id}>
                            {check.label}: {check.message}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action="/api/outreach/drafts/decision" method="post">
                          <input type="hidden" name="firm_id" value={primary.firm_id} />
                          <input type="hidden" name="draft_id" value={draft.id} />
                          <input type="hidden" name="action" value="approve" />
                          <button
                            type="submit"
                            className="rounded-md border border-emerald-300/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                          >
                            Approve
                          </button>
                        </form>
                        <form action="/api/outreach/drafts/decision" method="post">
                          <input type="hidden" name="firm_id" value={primary.firm_id} />
                          <input type="hidden" name="draft_id" value={draft.id} />
                          <input type="hidden" name="action" value="skip" />
                          <button
                            type="submit"
                            className="rounded-md border border-amber-300/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200"
                          >
                            Skip
                          </button>
                        </form>
                        {draft.status === "approved" ? (
                          <form action="/api/outreach/send" method="post">
                            <input type="hidden" name="draft_id" value={draft.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200"
                            >
                              Send now
                            </button>
                          </form>
                        ) : null}
                      </div>
                      {draft.sent_at ? (
                        <p className="mt-2 text-[11px] text-emerald-300">
                          Sent at {new Date(draft.sent_at).toLocaleString()}
                        </p>
                      ) : null}

                      <form action="/api/outreach/drafts/decision" method="post" className="mt-3 grid gap-2">
                        <input type="hidden" name="firm_id" value={primary.firm_id} />
                        <input type="hidden" name="draft_id" value={draft.id} />
                        <input type="hidden" name="action" value="edit" />
                        <input
                          name="subject"
                          defaultValue={draft.subject}
                          className="input-base text-xs px-2 py-1"
                        />
                        <textarea
                          name="body"
                          defaultValue={draft.body}
                          rows={5}
                          className="input-base text-xs px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-white/20 bg-[#111827] px-2.5 py-1 text-xs"
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
                    <div className="rounded-xl border border-dashed border-white/20 bg-[#0D1117] p-4 text-sm text-[#94A3B8] md:col-span-3">
                      No drafts yet for this prospect. Click &quot;Generate 3 drafts&quot; to start review.
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!prospects?.length ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-[#0D1117] p-5 text-sm text-[#94A3B8]">
              No prospects available yet. Add prospects in the dashboard first, then return to Outreach Writer.
            </div>
          ) : null}
        </section>
    </AppShell>
  );
}



