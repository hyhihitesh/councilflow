import { createClient } from "@/lib/supabase/server";

interface QuickStatsProps {
  firmId: string;
}

export async function QuickStats({ firmId }: QuickStatsProps) {
  const supabase = await createClient();

  const [
    { data: firmMembers },
    { data: invitations },
  ] = await Promise.all([
    supabase
      .from("firm_memberships")
      .select("id, role")
      .eq("firm_id", firmId),
    supabase
      .from("firm_invitations")
      .select("id, status")
      .eq("firm_id", firmId)
      .eq("status", "pending"),
  ]);

  const memberCount = firmMembers?.length ?? 0;
  const ownerCount = (firmMembers ?? []).filter((m) => m.role === "owner").length;
  const pendingInvites = invitations?.length ?? 0;

  return (
    <section className="mt-8 grid gap-4 md:grid-cols-3 stagger-children">
      <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Active Counsel</p>
        <p className="text-3xl font-light text-[#2C2A26] font-display">{memberCount}</p>
      </article>
      <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Firm Administrators</p>
        <p className="text-3xl font-light text-[#2C2A26] font-display">{ownerCount}</p>
      </article>
      <article className="metric-card bg-white border border-[#EBE8E0] p-6 rounded-sm shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Pending Access</p>
        <p className="text-3xl font-light text-[#2C2A26] font-display">{pendingInvites}</p>
      </article>
    </section>
  );
}
