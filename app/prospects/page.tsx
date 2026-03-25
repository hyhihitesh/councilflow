import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getFirmAccessState } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  error?: string;
  message?: string;
  q?: string;
  status?: string;
  min_score?: string;
};

export default async function ProspectsPage({
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

  const searchQuery = params.q?.trim() ?? "";
  const statusFilter = params.status?.trim().toLowerCase() ?? "all";
  const minScore = Number(params.min_score ?? "");
  const hasMinScore = Number.isFinite(minScore) && minScore >= 0;

  let prospectsQuery = supabase
    .from("prospects")
    .select(
      "id, company_name, domain, status, fit_score, score_explanation, primary_contact_name, primary_contact_title, primary_contact_email, created_at",
    )
    .eq("firm_id", primary.firm_id);

  if (searchQuery) {
    prospectsQuery = prospectsQuery.or(
      `company_name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%`,
    );
  }

  if (statusFilter && statusFilter !== "all") {
    prospectsQuery = prospectsQuery.eq("status", statusFilter);
  }

  if (hasMinScore) {
    prospectsQuery = prospectsQuery.gte("fit_score", minScore);
  }

  const { data: prospects } = await prospectsQuery
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const totalProspects = prospects?.length ?? 0;
  const qualifiedCount = (prospects ?? []).filter((item) => item.status === "qualified").length;
  const scoredProspects = (prospects ?? []).filter((item) => typeof item.fit_score === "number");
  const averageFitScore =
    scoredProspects.length > 0
      ? Math.round(
          scoredProspects.reduce((sum, item) => sum + Number(item.fit_score ?? 0), 0) /
            scoredProspects.length,
        )
      : null;

  return (
    <AppShell
      title="Prospect Queue"
      description={`Firm: ${firm?.name ?? "Unknown"} | Ranked opportunities with quick outreach actions.`}
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
      currentPath="/prospects"
      headerActions={
        <>
          <Link
            href="/outreach"
            className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors uppercase tracking-widest shadow-sm"
          >
            New Outreach
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {params.error ? <p className="mt-4 alert-error">{params.error}</p> : null}
        {params.message ? <p className="mt-4 alert-success">{params.message}</p> : null}

        <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
          <div className="mb-6 pb-6 border-b border-[#F7F6F2]">
            <h2 className="text-xl font-light tracking-tight">Filter prospects</h2>
          </div>
          <form
            method="get"
            className="mt-4 grid gap-3 rounded border border-[#F7F6F2] bg-[#FDFCFB] p-4 md:grid-cols-4"
          >
          <label className="grid gap-1">
            <span className="sr-only">Search prospects</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search company or domain"
              className="input-base text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="sr-only">Prospect status filter</span>
            <select name="status" defaultValue={statusFilter} className="input-base text-sm">
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="enriched">Enriched</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="sr-only">Minimum fit score</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              name="min_score"
              defaultValue={hasMinScore ? String(minScore) : ""}
              placeholder="Min score"
              className="input-base text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-[#2C2A26] text-[#F7F6F2] text-xs font-medium rounded hover:bg-[#4A4742] transition-colors uppercase tracking-wider"
            >
              Apply
            </button>
            <Link href="/prospects" className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-xs font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider">
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3 stagger-children">
        <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Visible prospects</p>
          <p className="text-3xl font-light text-[#2C2A26] font-display">{totalProspects}</p>
        </article>
        <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Qualified</p>
          <p className="text-3xl font-light text-[#2C2A26] font-display">{qualifiedCount}</p>
        </article>
        <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Average fit score</p>
          <p className="text-3xl font-light text-[#2C2A26] font-display">{averageFitScore ?? "-"}</p>
        </article>
      </section>

      <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
        <div className="mb-6 pb-6 border-b border-[#F7F6F2]">
          <h2 className="text-xl font-light tracking-tight">Ranked queue</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Top-fit opportunities with one-click enrichment and outreach generation.
          </p>
        </div>

        <div className="mt-4 space-y-4 md:hidden">
          {(prospects ?? []).map((prospect) => (
            <article key={`mobile-${prospect.id}`} className="rounded border border-[#F7F6F2] bg-[#FDFCFB] p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[#2C2A26]">{prospect.company_name}</p>
                  <p className="mt-1 text-xs text-[#716E68]">{prospect.domain ?? "-"}</p>
                </div>
                <span className="status-badge capitalize">{prospect.status}</span>
              </div>
              <p className="mt-3 text-xs text-[#716E68]">
                Contact: {prospect.primary_contact_name ?? "-"} | {prospect.primary_contact_title ?? "-"}
              </p>
              <p className="mt-1 text-xs text-[#716E68]">
                Fit score: {prospect.fit_score != null ? prospect.fit_score : "-"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action="/api/outreach/drafts/generate" method="post">
                  <input type="hidden" name="prospect_id" value={prospect.id} />
                  <button
                    className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                    type="submit"
                  >
                    Draft
                  </button>
                </form>
                <form action="/api/research/runs" method="post">
                  <input type="hidden" name="prospect_id" value={prospect.id} />
                  <input type="hidden" name="limit" value="1" />
                  <button
                    className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                    type="submit"
                  >
                    Refresh
                  </button>
                </form>
              </div>
            </article>
          ))}
          {!prospects?.length ? (
            <p className="rounded border border-dashed border-[#EBE8E0] bg-[#FDFCFB] px-5 py-6 text-sm text-[#716E68] text-center">
              No prospects found for this filter set.
            </p>
          ) : null}
        </div>

        <div className="mt-6 hidden table-shell md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Company</th>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Contact</th>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Status</th>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Fit score</th>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Top reasons</th>
                <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px] text-[#A19D94]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F7F6F2]">
              {(prospects ?? []).map((prospect) => (
                <tr key={prospect.id} className="hover:bg-[#FDFCFB]/50 transition-colors align-top">
                  <td className="px-5 py-4">
                    <p className="font-medium text-[#2C2A26]">{prospect.company_name}</p>
                    <p className="mt-1 text-xs text-[#716E68]">{prospect.domain ?? "-"}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#716E68]">
                    <p className="font-medium text-[#2C2A26]">{prospect.primary_contact_name ?? "-"}</p>
                    <p className="mt-1">{prospect.primary_contact_title ?? "-"}</p>
                    <p className="mt-1">{prospect.primary_contact_email ?? "-"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="status-badge capitalize">{prospect.status}</span>
                  </td>
                  <td className="px-5 py-4">
                    {prospect.fit_score != null ? (
                      <span className="rounded px-2.5 py-1 text-xs font-medium border border-emerald-100 bg-emerald-50 text-emerald-800">
                        {prospect.fit_score}
                      </span>
                    ) : (
                      <span className="text-[#A19D94]">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-[#716E68]">
                    {Array.isArray(prospect.score_explanation) && prospect.score_explanation.length ? (
                      <div className="space-y-1">
                        {prospect.score_explanation.slice(0, 2).map((item, index) => (
                          <p key={`${prospect.id}-reason-${index}`}>
                            {(item as { reason?: string }).reason ?? "Signal detected"}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#A19D94] italic">No reasons yet</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <form action="/api/outreach/drafts/generate" method="post">
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <button
                          className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                          type="submit"
                        >
                          Draft
                        </button>
                      </form>
                      <form action="/api/prospects/enrich/tavily" method="post">
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <button
                          className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                          type="submit"
                        >
                          Tavily
                        </button>
                      </form>
                      <form action="/api/prospects/enrich/firecrawl" method="post">
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <button
                          className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                          type="submit"
                        >
                          Firecrawl
                        </button>
                      </form>
                      <form action="/api/research/runs" method="post">
                        <input type="hidden" name="prospect_id" value={prospect.id} />
                        <input type="hidden" name="limit" value="1" />
                        <button
                          className="px-3 py-1.5 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-white transition-all uppercase tracking-wider"
                          type="submit"
                        >
                          Refresh
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!prospects?.length ? (
                <tr>
                  <td className="px-5 py-8 text-sm text-[#716E68] text-center" colSpan={6}>
                    No prospects found for this filter set.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </AppShell>
  );
}
