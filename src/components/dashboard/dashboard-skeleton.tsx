export function SectionSkeleton() {
  return (
    <div className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm animate-pulse">
      <div className="h-6 bg-[#F7F6F2] w-1/4 mb-4 rounded"></div>
      <div className="h-4 bg-[#FDFCFB] w-1/2 mb-8 rounded"></div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="h-20 bg-[#FDFCFB] rounded border border-[#F7F6F2]"></div>
        <div className="h-20 bg-[#FDFCFB] rounded border border-[#F7F6F2]"></div>
        <div className="h-20 bg-[#FDFCFB] rounded border border-[#F7F6F2]"></div>
        <div className="h-20 bg-[#FDFCFB] rounded border border-[#F7F6F2]"></div>
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3 animate-pulse">
      <div className="h-32 bg-white border border-[#EBE8E0] rounded-sm shadow-sm"></div>
      <div className="h-32 bg-white border border-[#EBE8E0] rounded-sm shadow-sm"></div>
      <div className="h-32 bg-white border border-[#EBE8E0] rounded-sm shadow-sm"></div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="mt-8 bg-white border border-[#EBE8E0] p-8 rounded-sm animate-pulse">
      <div className="h-6 bg-[#F7F6F2] w-1/3 mb-8 rounded"></div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-[#FDFCFB] rounded border border-[#F7F6F2]"></div>
        ))}
      </div>
    </div>
  );
}
