/**
 * Reusable page-level loading skeleton.
 * Used by every app page's loading.tsx for instant visual feedback.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-white/10" />
        <div className="h-4 w-72 rounded-md bg-white/6" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white/8 border border-white/5" />
        ))}
      </div>

      {/* Table rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-white/6 border border-white/5" />
        ))}
      </div>
    </div>
  );
}
