import { createClient } from "@/lib/supabase/server";

interface CalendarSectionProps {
  firmId: string;
}

export async function CalendarSection({ firmId }: CalendarSectionProps) {
  const supabase = await createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const { data: recentCalendarEvents } = await supabase
    .from("calendar_events")
    .select("id, prospect_id, provider, status, title, starts_at, ends_at, meeting_url, created_at")
    .eq("firm_id", firmId)
    .gte("starts_at", thirtyDaysAgo.toISOString())
    .order("starts_at", { ascending: false })
    .limit(50);

  const calendarProspectIds = Array.from(
    new Set(
      (recentCalendarEvents ?? [])
        .map((event) => event.prospect_id)
        .filter((value): value is string => typeof value === "string")
    )
  );

  const { data: calendarProspects } = calendarProspectIds.length
    ? await supabase.from("prospects").select("id, company_name").in("id", calendarProspectIds)
    : { data: [] };

  const calendarProspectMap = new Map(
    (calendarProspects ?? []).map((prospect) => [prospect.id, prospect.company_name])
  );
  const recentMeetingLinks = (recentCalendarEvents ?? []).slice(0, 5);

  return (
    <section className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm reveal-up shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl font-light tracking-tight">Calendar Synchronization</h2>
          <p className="mt-2 text-sm text-[#716E68]">
            Recent engagement events identified via connected workspace accounts.
          </p>
        </div>
        <a
          href="/pipeline"
          className="px-4 py-2 border border-[#EBE8E0] text-[#716E68] text-[10px] font-medium rounded hover:text-[#2C2A26] hover:bg-[#FDFCFB] transition-all uppercase tracking-widest flex items-center"
        >
          Open Pipeline
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">
            Synced Events (30d)
          </p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">
            {recentCalendarEvents?.length ?? 0}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Video Sessions</p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">
            {(recentCalendarEvents ?? []).filter((event) => Boolean(event.meeting_url)).length}
          </p>
        </div>
        <div className="rounded border border-[#F7F6F2] bg-[#FDFCFB] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">Cancellations</p>
          <p className="text-xl font-light tracking-tight text-[#2C2A26]">
            {(recentCalendarEvents ?? []).filter((event) => event.status === "cancelled").length}
          </p>
        </div>
      </div>

      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Prospect
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">
                Schedule
              </th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Status</th>
              <th className="px-5 py-4 font-medium uppercase tracking-widest text-[10px]">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F7F6F2]">
            {recentMeetingLinks.map((event) => (
              <tr key={`calendar-linked-${event.id}`} className="hover:bg-[#FDFCFB]/50 transition-colors">
                <td className="px-5 py-4 font-medium text-[#2C2A26]">
                  {calendarProspectMap.get(event.prospect_id) ?? event.prospect_id}
                </td>
                <td className="px-5 py-4 text-xs text-[#716E68]">
                  {new Date(event.starts_at).toLocaleString()}
                </td>
                <td className="px-5 py-4">
                  <span className="status-badge capitalize bg-[#F7F6F2] text-[#716E68]">
                    {event.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  {event.meeting_url ? (
                    <a
                      className="px-3 py-1 bg-[#2C2A26] text-[#F7F6F2] text-[10px] font-medium rounded uppercase tracking-wider block text-center"
                      href={event.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#A19D94] uppercase tracking-widest">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!recentMeetingLinks.length && (
              <tr>
                <td
                  className="px-5 py-12 text-center text-[#A19D94] text-xs uppercase tracking-widest"
                  colSpan={5}
                >
                  No synced engagements detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
