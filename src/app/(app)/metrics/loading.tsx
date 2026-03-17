import { SkeletonChart, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-pulse">
        <div className="space-y-2">
          <div className="h-3 bg-(--card-70) rounded w-16" />
          <div className="h-8 bg-(--card-70) rounded w-52" />
          <div className="h-4 bg-(--card-70) rounded w-48" />
          <div className="h-4 bg-(--card-70) rounded w-40" />
        </div>
        <div className="h-8 bg-(--card-70) rounded-full w-32" />
      </div>

      {/* Filter bar */}
      <div className="h-10 bg-(--card-70) rounded-full animate-pulse" />

      {/* Tab nav: DORA / Flow / Quality / Throughput */}
      <div className="flex flex-wrap gap-2 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 bg-(--card-70) rounded-full w-24" />
        ))}
      </div>

      {/* Active tab section header + metric chips */}
      <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 bg-(--card-70) rounded w-28" />
            <div className="h-4 bg-(--card-70) rounded w-48" />
          </div>
          <div className="h-3 bg-(--card-70) rounded w-24" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 bg-(--card-70) rounded-full w-28" />
          ))}
        </div>
      </div>

      {/* Metric cards grid (2 cols mobile, 4 cols desktop) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 space-y-3"
          >
            <div className="h-3 bg-(--card-70) rounded w-24" />
            <div className="h-8 bg-(--card-70) rounded w-16" />
            <div className="h-3 bg-(--card-70) rounded w-12" />
            <div className="h-12 bg-(--card-70) rounded" />
          </div>
        ))}
      </div>

      {/* Quadrant chart */}
      <SkeletonChart height="h-72" />

      {/* Associations + Contributors side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 animate-pulse space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 bg-(--card-70) rounded w-40" />
            <div className="h-3 bg-(--card-70) rounded w-24" />
          </div>
          <div className="h-4 bg-(--card-70) rounded w-56" />
          <div className="h-32 bg-(--card-70) rounded-2xl" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 bg-(--card-70) rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 animate-pulse space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 bg-(--card-70) rounded w-44" />
            <div className="h-3 bg-(--card-70) rounded w-24" />
          </div>
          <div className="h-4 bg-(--card-70) rounded w-56" />
          <div className="h-32 bg-(--card-70) rounded-2xl" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 bg-(--card-70) rounded-2xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-(--card-70) rounded w-24" />
          <div className="h-3 bg-(--card-70) rounded w-28" />
        </div>
        <SkeletonTable rows={4} cols={4} />
      </div>
    </div>
  );
}
