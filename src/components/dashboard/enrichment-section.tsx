import { createClient } from "@/lib/supabase/server";

interface EnrichmentSectionProps {
  firmId: string;
}

export async function EnrichmentSection({ firmId }: EnrichmentSectionProps) {
  const supabase = await createClient();

  const { data: enrichmentRuns } = await supabase
    .from("prospect_enrichment_runs")
    .select("id, prospect_id, provider, status, error_message, created_at, completed_at")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(12);

  const enrichmentProspectIds = Array.from(
    new Set(
      (enrichmentRuns ?? [])
        .map((run) => run.prospect_id)
        .filter((value): value is string => typeof value === "string")
    )
  );

  const { data: enrichmentProspects } = enrichmentProspectIds.length
    ? await supabase.from("prospects").select("id, company_name").in("id", enrichmentProspectIds)
    : { data: [] };

  const enrichmentProspectMap = new Map(
    (enrichmentProspects ?? []).map((prospect) => [prospect.id, prospect.company_name])
  );

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <h2 className="text-xl font-light tracking-tight mb-8">Enrichment Status Queue</h2>
      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Prospect
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Provider
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Telemetry
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {(enrichmentRuns ?? []).map((run) => {
              const actionRoute =
                run.provider === "tavily"
                  ? "/api/prospects/enrich/tavily"
                  : run.provider === "firecrawl"
                    ? "/api/prospects/enrich/firecrawl"
                    : run.provider === "exa_search" || run.provider === "exa_contents"
                      ? "/api/prospects/enrich/exa"
                      : run.provider === "vibe"
                        ? "/api/prospects/enrich/vibe"
                        : "";

              return (
                <tr key={run.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                  <td className="px-5 py-4 text-[#2C2A26]">
                    {run.prospect_id
                      ? (enrichmentProspectMap.get(run.prospect_id) ?? run.prospect_id)
                      : "-"}
                  </td>
                  <td className="px-5 py-4 capitalize text-[#716E68] text-xs font-medium">
                    {run.provider}
                  </td>
                  <td className="px-5 py-4">
                    <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[10px] text-[#A19D94] max-w-xs">
                    {run.error_message
                      ? run.error_message.includes("429")
                        ? "Provider Rate Limit"
                        : run.error_message.includes("Timeout")
                          ? "Extraction Timeout"
                          : run.error_message.slice(0, 100)
                      : "Nominal"}
                  </td>
                  <td className="px-5 py-4">
                    {run.status === "failed" && run.prospect_id && actionRoute ? (
                      <form action={actionRoute} method="post">
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="prospect_id" value={run.prospect_id} />
                        {run.provider === "exa_search" && (
                          <input type="hidden" name="mode" value="search" />
                        )}
                        {run.provider === "exa_contents" && (
                          <input type="hidden" name="mode" value="contents" />
                        )}
                        <button
                          type="submit"
                          className="px-3 py-1 bg-[#EFECE5] text-[#716E68] text-[10px] font-medium rounded hover:bg-[#D5D1C6] transition-colors uppercase tracking-wider"
                        >
                          Retry
                        </button>
                      </form>
                    ) : (
                      <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!enrichmentRuns?.length && (
              <tr>
                <td
                  className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest"
                  colSpan={5}
                >
                  No active enrichment tasks
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
