import { createClient } from "@/lib/supabase/server";

interface ResearchSectionProps {
  firmId: string;
}

export async function ResearchSection({ firmId }: ResearchSectionProps) {
  const supabase = await createClient();

  const { data: researchRuns } = await supabase
    .from("research_runs")
    .select("id, trigger_type, status, retry_count, run_summary, error_message, created_at")
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(10);

  const scheduledRuns = (researchRuns ?? []).filter((run) => run.trigger_type === "scheduled");
  const scheduledFailedCount = scheduledRuns.filter((run) => run.status === "failed").length;
  const latestScheduledRun = scheduledRuns[0];

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl font-light tracking-tight">Research Orchestrator</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Orchestrate intelligence runs across the full prospect dataset.
          </p>
        </div>
        <form action="/api/research/runs" method="post">
          <input type="hidden" name="firm_id" value={firmId} />
          <button type="submit" className="btn-primary">
            Trigger All
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Active Runs</p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">{scheduledRuns.length}</p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Run Failures</p>
          <p
            className={`text-xl font-light tracking-tight ${
              scheduledFailedCount > 0 ? "text-red-600" : "text-[#2C2A26]"
            }`}
          >
            {scheduledFailedCount}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Last Sync</p>
          <p className="text-[11px] font-medium text-[#716E68]">
            {latestScheduledRun ? new Date(latestScheduledRun.created_at).toLocaleDateString() : "N/A"}
          </p>
        </div>
      </div>

      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Job ID</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Trigger
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Throughput
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {(researchRuns ?? []).map((run) => {
              const summary =
                run.run_summary && typeof run.run_summary === "object"
                  ? (run.run_summary as Record<string, unknown>)
                  : {};
              const totalProspects = Number(summary.total_prospects ?? 0);
              const successCount = Number(summary.provider_success_count ?? 0);
              const failedCount = Number(summary.provider_failure_count ?? 0);

              return (
                <tr key={run.id} className="hover:bg-[#FDFCFB]/50 transition-colors">
                  <td className="px-5 py-4 font-mono text-[10px] text-[#A19D94]">
                    {run.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-4 capitalize text-xs text-[#716E68]">
                    {run.trigger_type}
                    {run.retry_count > 0 ? ` (${run.retry_count})` : ""}
                  </td>
                  <td className="px-5 py-4">
                    <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[10px] text-[#A19D94]">
                    S: {successCount} | F: {failedCount} | T: {totalProspects}
                  </td>
                  <td className="px-5 py-4">
                    {run.status === "failed" ? (
                      <form action="/api/research/runs" method="post">
                        <input type="hidden" name="firm_id" value={firmId} />
                        <input type="hidden" name="retry_run_id" value={run.id} />
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
            {!researchRuns?.length && (
              <tr>
                <td
                  className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest"
                  colSpan={5}
                >
                  No historical runs detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
