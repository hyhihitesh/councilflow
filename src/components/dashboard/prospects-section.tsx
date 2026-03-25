import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface ProspectsSectionProps {
  firmId: string;
  searchQuery?: string;
  statusFilter?: string;
  minScore?: number;
}

export async function ProspectsSection({
  firmId,
  searchQuery = "",
  statusFilter = "all",
  minScore,
}: ProspectsSectionProps) {
  const supabase = await createClient();

  // Build filtered prospects query
  let prospectsQuery = supabase
    .from("prospects")
    .select("id, company_name, domain, status, fit_score, score_explanation, created_at")
    .eq("firm_id", firmId);

  if (searchQuery) {
    prospectsQuery = prospectsQuery.or(
      `company_name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%`
    );
  }
  if (statusFilter && statusFilter !== "all") {
    prospectsQuery = prospectsQuery.eq("status", statusFilter);
  }
  if (minScore !== undefined && Number.isFinite(minScore) && minScore >= 0) {
    prospectsQuery = prospectsQuery.gte("fit_score", minScore);
  }

  const { data: prospects } = await prospectsQuery
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light tracking-tight text-[#2C2A26]">Firm Intelligence Queue</h2>
            <p className="mt-2 text-sm text-[#716E68]">
              High-fidelity prospects identified via automated research.
            </p>
          </div>
          <Link
            href="/prospects"
            className="text-[10px] uppercase tracking-widest font-bold text-[#2C2A26] hover:opacity-70 transition-opacity border-b-2 border-[#2C2A26] pb-0.5"
          >
            View All
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {(prospects ?? []).map((prospect) => (
          <div
            key={prospect.id}
            className="group flex flex-wrap items-center justify-between gap-4 rounded border border-[#F7F6F2] bg-[#FDFCFB] px-6 py-5 hover:border-[#D5D1C6] hover:bg-white transition-all duration-300 shadow-sm"
          >
            <div className="flex items-center gap-5">
              <div className="w-10 h-10 rounded-sm bg-[#2C2A26] text-[#F7F6F2] flex items-center justify-center text-xs font-bold uppercase tracking-tighter">
                {prospect.company_name.charAt(0)}
              </div>
              <div>
                <h3 className="font-medium text-[#2C2A26] group-hover:text-black transition-colors">
                  {prospect.company_name}
                </h3>
                <p className="text-[11px] text-[#A19D94] uppercase tracking-wider mt-0.5">
                  {prospect.domain}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-1">Fit Score</p>
                <span className="text-sm font-medium text-[#6B705C] bg-[#6B705C]/5 px-2 py-0.5 rounded">
                  {prospect.fit_score ?? "???"}
                </span>
              </div>
              <div className="text-right min-w-[100px]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-1">Status</p>
                <span className="status-badge bg-[#F7F6F2] text-[#716E68] text-[10px] uppercase tracking-widest font-bold">
                  {prospect.status}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#D5D1C6] group-hover:text-[#2C2A26] transition-all transform group-hover:translate-x-1" />
            </div>
          </div>
        ))}

        {(!prospects || prospects.length === 0) && (
          <div className="rounded border-2 border-dashed border-[#EBE8E0] bg-[#FDFCFB]/50 p-12 text-center animate-pulse-subtle">
            <div className="max-w-md mx-auto">
              <Users className="w-10 h-10 text-[#D5D1C6] mx-auto mb-6 opacity-60" />
              <h3 className="text-lg font-light text-[#2C2A26] mb-3">Begin Your Intelligence Lifecycle</h3>
              <p className="text-sm text-[#716E68] leading-relaxed mb-8 font-light">
                Your firm's prospect queue is currently empty. Start by ingesting leads to activate
                the research engine and generate targeted outreach.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/prospects"
                  className="w-full sm:w-auto px-6 py-3 bg-[#2C2A26] text-[#F7F6F2] text-[11px] font-medium rounded-sm hover:bg-[#4A4742] transition-colors shadow-lg uppercase tracking-widest"
                >
                  Ingest First Prospect
                </Link>
                <Link
                  href="/outreach"
                  className="w-full sm:w-auto px-6 py-3 border border-[#EBE8E0] text-[#716E68] text-[11px] font-medium rounded-sm hover:bg-white hover:text-[#2C2A26] transition-all uppercase tracking-widest"
                >
                  Explore Writer
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
