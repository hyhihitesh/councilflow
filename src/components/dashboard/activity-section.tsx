import { createClient } from "@/lib/supabase/server";

interface ActivitySectionProps {
  firmId: string;
}

export async function ActivitySection({ firmId }: ActivitySectionProps) {
  const supabase = await createClient();

  const auditSince = new Date();
  auditSince.setUTCDate(auditSince.getUTCDate() - 30);
  const auditSinceIso = auditSince.toISOString();

  const [agentRunsFeedResult, agentToolCallsFeedResult] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("id, run_type, status, created_at, completed_at")
      .eq("firm_id", firmId)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("agent_tool_calls")
      .select("id, run_id, tool_name, status, duration_ms, created_at")
      .eq("firm_id", firmId)
      .gte("created_at", auditSinceIso)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const agentRunsFeed = agentRunsFeedResult.data ?? [];
  const agentToolCallsFeed = agentToolCallsFeedResult.data ?? [];

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-[#F7F6F2]">
        <div>
          <h2 className="text-xl font-light tracking-tight">Agent Activity & Audit</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Recent 30-day operational telemetry for automated workflows.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/audit/export?format=json&days=30"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest"
          >
            Export JSON
          </a>
          <a
            href="/api/audit/export?format=csv&days=30"
            className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <article>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-4">
            Autonomous Runs
          </h3>
          <div className="space-y-3">
            {agentRunsFeed.map((run) => (
              <div
                key={`agent-run-${run.id}`}
                className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 shadow-sm hover:border-[#D5D1C6] transition-all"
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs font-medium text-[#2C2A26]">
                    <span className="uppercase tracking-wider text-[10px] text-[#A19D94] mr-2">
                      {run.run_type}
                    </span>
                    {run.status}
                  </p>
                </div>
                <p className="mt-1 text-[10px] text-[#A19D94] uppercase tracking-tight">
                  {run.id.slice(0, 8)} • {new Date(run.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {!agentRunsFeed.length && (
              <div className="rounded border border-dashed border-[#EBE8E0] px-4 py-6 text-center">
                <p className="text-xs text-[#A19D94]">No records in the current window.</p>
              </div>
            )}
          </div>
        </article>

        <article>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-4">
            Intelligence Signals
          </h3>
          <div className="space-y-3">
            {agentToolCallsFeed.map((call) => (
              <div
                key={`agent-call-${call.id}`}
                className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-4 py-3 shadow-sm hover:border-[#D5D1C6] transition-all"
              >
                <div className="flex justify-between items-start">
                  <p className="text-xs font-medium text-[#2C2A26]">
                    <span className="uppercase tracking-wider text-[10px] text-[#A19D94] mr-2">
                      {call.tool_name}
                    </span>
                    {call.status}
                  </p>
                  <span className="text-[10px] text-[#A19D94]">{call.duration_ms ?? "-"}ms</span>
                </div>
                <p className="mt-1 text-[10px] text-[#A19D94] uppercase tracking-tight">
                  {call.run_id.slice(0, 8)} • {new Date(call.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {!agentToolCallsFeed.length && (
              <div className="rounded border border-dashed border-[#EBE8E0] px-4 py-6 text-center">
                <p className="text-xs text-[#A19D94]">No signal records detected.</p>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
