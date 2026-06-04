import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";

const NAV_SKELETON_ITEMS = [
  "cockpit",
  "diagnose",
  "plan",
  "improve",
  "govern",
  "ai",
  "reports",
  "admin",
];
const SIGNAL_SKELETON_ITEMS = ["top", "second", "third", "fourth"];

function NavSkeleton() {
  return (
    <aside className="w-full md:max-w-56 md:shrink-0 animate-pulse">
      <div className="sticky top-10 space-y-2">
        {NAV_SKELETON_ITEMS.map((item) => (
          <div key={item} className="h-10 bg-(--card-70) rounded-2xl" />
        ))}
      </div>
    </aside>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <NavSkeleton />
        <main className="flex min-w-0 flex-1 flex-col gap-10">
          {/* Header card */}
          <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 animate-pulse">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-4">
                  <SkeletonLine width="w-16" height="h-3" />
                  {/* Role selector */}
                  <div className="h-8 bg-(--card-70) rounded-full w-40" />
                  {/* Page title */}
                  <div className="h-9 bg-(--card-70) rounded w-72 mt-6" />
                  <div className="h-4 bg-(--card-70) rounded w-56" />
                  <div className="h-4 bg-(--card-70) rounded w-48" />
                </div>
                <div className="flex gap-3">
                  <div className="h-8 bg-(--card-70) rounded-full w-24" />
                  <div className="h-8 bg-(--card-70) rounded-full w-20" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="h-4 bg-(--card-70) rounded w-48" />
                <div className="h-4 bg-(--card-70) rounded w-40" />
              </div>
            </div>
          </div>

          <div className="h-10 bg-(--card-70) rounded-full animate-pulse" />

          {/* Cockpit / key signals area */}
          <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 animate-pulse space-y-4">
            <div className="h-5 bg-(--card-70) rounded w-40" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {SIGNAL_SKELETON_ITEMS.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-(--card-stroke) bg-(--card) p-4 space-y-3"
                >
                  <div className="h-3 bg-(--card-70) rounded w-20" />
                  <div className="h-7 bg-(--card-70) rounded w-16" />
                  <div className="h-3 bg-(--card-70) rounded w-12" />
                </div>
              ))}
            </div>
            <div className="h-48 bg-(--card-70) rounded-2xl" />
          </div>

          {/* Investment mix section */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <div className="h-6 bg-(--card-70) rounded w-36 animate-pulse" />
              <div className="h-4 bg-(--card-70) rounded w-64 animate-pulse" />
              <div className="flex gap-4">
                <div className="h-3 bg-(--card-70) rounded w-28 animate-pulse" />
                <div className="h-3 bg-(--card-70) rounded w-28 animate-pulse" />
              </div>
            </div>
            <SkeletonCard lines={4} />
          </div>
        </main>
      </div>
    </div>
  );
}
