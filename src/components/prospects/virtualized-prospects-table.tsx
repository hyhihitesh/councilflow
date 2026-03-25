"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export type ProspectRow = {
  id: string;
  company_name: string;
  domain: string | null;
  status: string;
  fit_score: number | null;
  score_explanation: unknown;
  primary_contact_name: string | null;
  primary_contact_title: string | null;
  primary_contact_email: string | null;
  created_at: string;
};

interface VirtualizedProspectsTableProps {
  prospects: ProspectRow[];
}

export function VirtualizedProspectsTable({ prospects }: VirtualizedProspectsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: prospects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // estimated row height in px
    overscan: 5,
  });

  return (
    <div className="mt-6 hidden table-shell md:block">
      <div className="w-full text-left text-sm">
        <div className="sticky top-0 z-10 flex border-b border-[#F7F6F2] bg-white text-[10px] font-medium uppercase tracking-widest text-[#A19D94]">
          <div className="w-[20%] px-5 py-4">Company</div>
          <div className="w-[20%] px-5 py-4">Contact</div>
          <div className="w-[10%] px-5 py-4">Status</div>
          <div className="w-[10%] px-5 py-4">Fit score</div>
          <div className="w-[25%] px-5 py-4">Top reasons</div>
          <div className="w-[15%] px-5 py-4">Actions</div>
        </div>

        <div
          ref={parentRef}
          className="max-h-[600px] overflow-auto"
          style={{ width: "100%" }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const prospect = prospects[virtualRow.index];
              return (
                <div
                  key={prospect.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex border-b border-[#F7F6F2] hover:bg-[#FDFCFB]/50 transition-colors"
                >
                  <div className="w-[20%] px-5 py-4">
                    <p className="font-medium text-[#2C2A26] line-clamp-1">{prospect.company_name}</p>
                    <p className="mt-1 text-xs text-[#716E68] line-clamp-1">{prospect.domain ?? "-"}</p>
                  </div>
                  <div className="w-[20%] px-5 py-4 text-xs text-[#716E68]">
                    <p className="font-medium text-[#2C2A26] line-clamp-1">{prospect.primary_contact_name ?? "-"}</p>
                    <p className="mt-1 line-clamp-1">{prospect.primary_contact_title ?? "-"}</p>
                    <p className="mt-1 line-clamp-1">{prospect.primary_contact_email ?? "-"}</p>
                  </div>
                  <div className="w-[10%] px-5 py-4 flex items-start">
                    <span className="status-badge capitalize whitespace-nowrap">{prospect.status}</span>
                  </div>
                  <div className="w-[10%] px-5 py-4 flex items-start">
                    {prospect.fit_score != null ? (
                      <span className="rounded px-2.5 py-1 text-xs font-medium border border-emerald-100 bg-emerald-50 text-emerald-800">
                        {prospect.fit_score}
                      </span>
                    ) : (
                      <span className="text-[#A19D94]">-</span>
                    )}
                  </div>
                  <div className="w-[25%] px-5 py-4 text-xs text-[#716E68]">
                    {Array.isArray(prospect.score_explanation) && prospect.score_explanation.length ? (
                      <div className="space-y-1">
                        {prospect.score_explanation.slice(0, 2).map((item, index) => (
                          <p key={`${prospect.id}-reason-${index}`} className="line-clamp-1">
                            {(item as { reason?: string }).reason ?? "Signal detected"}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#A19D94] italic">No reasons yet</span>
                    )}
                  </div>
                  <div className="w-[15%] px-5 py-4">
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!prospects?.length ? (
          <div className="px-5 py-8 text-sm text-[#716E68] text-center border-t border-[#F7F6F2]">
            No prospects found for this filter set.
          </div>
        ) : null}
      </div>
    </div>
  );
}
