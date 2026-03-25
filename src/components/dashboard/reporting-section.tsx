import { createClient } from "@/lib/supabase/server";
import { summarizeReportingObservability } from "@/lib/reporting/health";

interface ReportingSectionProps {
  firmId: string;
}

export async function ReportingSection({ firmId }: ReportingSectionProps) {
  const supabase = await createClient();

  const { data: reportingRuns } = await supabase
    .from("reporting_runs")
    .select(
      "id, status, week_start, week_end, summary_title, error_message, created_at, completed_at"
    )
    .eq("firm_id", firmId)
    .order("created_at", { ascending: false })
    .limit(10);

  const reportingRunIds = (reportingRuns ?? []).map((run) => run.id);
  const { data: reportingDeliveries } = reportingRunIds.length
    ? await supabase
        .from("reporting_deliveries")
        .select(
          "id, reporting_run_id, delivery_mode, recipient, status, error_message, created_at, attempted_at, attempt_count, last_error_code, last_error_message"
        )
        .eq("firm_id", firmId)
        .in("reporting_run_id", reportingRunIds)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const reportingObservability = summarizeReportingObservability({
    runs: reportingRuns ?? [],
    deliveries: reportingDeliveries ?? [],
  });

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl font-light tracking-tight">Reporting Digest Health</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Weekly orchestration and delivery telemetry for firm-wide insights.
          </p>
        </div>
        <form action="/api/reporting/schedule/weekly" method="post">
          <button type="submit" className="btn-primary">
            Trigger Outbound
          </button>
        </form>
      </div>

      <div
        className={
          reportingObservability.degraded
            ? "mb-8 rounded border border-red-100 bg-red-50/50 px-5 py-4 text-xs text-red-700"
            : "mb-8 rounded border border-[#EFECE5] bg-[#FDFCFB] px-5 py-4 text-xs text-[#6B705C]"
        }
      >
        <p className="uppercase tracking-widest font-bold mb-1">
          System Health: {reportingObservability.degraded ? "Issues Detected" : "Nominal"}
        </p>
        <p className="text-[#716E68]">
          {reportingObservability.degraded
            ? "Delivery failures detected in recent cycles. Manual verification recommended."
            : "All scheduled reports delivered successfully to firm recipients."}
        </p>
        <p className="mt-2 italic font-medium">{reportingObservability.actionHint}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Total Cycles</p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">
            {reportingRuns?.length ?? 0}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Failed (Last)</p>
          <p
            className={`text-xl font-light tracking-tight ${
              reportingObservability.failedCount > 0 ? "text-red-600" : "text-[#2C2A26]"
            }`}
          >
            {reportingObservability.failedCount}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">
            Delivered (Last)
          </p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">
            {reportingObservability.sentCount}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Last Run</p>
          <p className="text-[11px] font-medium text-[#716E68]">
            {reportingObservability.lastRunAt
              ? new Date(reportingObservability.lastRunAt).toLocaleDateString()
              : "N/A"}
          </p>
        </div>
      </div>

      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Reporting Window
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Intelligence Summary
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {(reportingRuns ?? []).map((run) => (
              <tr key={`reporting-run-${run.id}`} className="hover:bg-[#FDFCFB]/50 transition-colors">
                <td className="px-5 py-4 text-xs font-medium text-[#2C2A26]">
                  {run.week_start} — {run.week_end}
                </td>
                <td className="px-5 py-4">
                  <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                    {run.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-[#716E68]">
                  {run.summary_title ?? "Operational report generated"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
