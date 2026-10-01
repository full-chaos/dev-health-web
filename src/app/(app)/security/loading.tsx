import { SkeletonLine } from "@/components/ui/Skeleton";

export default function SecurityLoading() {
    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <div className="space-y-2">
                <SkeletonLine height="h-3" width="w-24" />
                <SkeletonLine height="h-8" width="w-48" />
                <SkeletonLine height="h-4" width="w-80" />
            </div>

            {/* KPI tiles skeleton */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => `kpi-skeleton-${index}`).map((key) => (
                    <div
                        key={key}
                        className="flex flex-col gap-2 rounded-2xl border border-(--card-stroke) bg-card px-5 py-4"
                    >
                        <SkeletonLine height="h-3" width="w-1/2" />
                        <SkeletonLine height="h-8" width="w-1/3" />
                    </div>
                ))}
            </div>

            {/* Charts skeleton */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
                    <SkeletonLine height="h-48" />
                </div>
                <div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
                    <SkeletonLine height="h-48" />
                </div>
            </div>

            {/* Trend chart skeleton */}
            <div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
                <SkeletonLine height="h-64" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-2xl border border-(--card-stroke) bg-card">
                <div className="p-4">
                    <SkeletonLine height="h-10" />
                </div>
                <div className="divide-y divide-(--card-stroke)">
                    {Array.from({ length: 8 }, (_, index) => `row-skeleton-${index}`).map((key) => (
                        <div key={key} className="flex gap-3 px-3 py-3">
                            <SkeletonLine height="h-5" width="w-16" />
                            <SkeletonLine height="h-5" width="w-20" />
                            <SkeletonLine height="h-5" />
                            <SkeletonLine height="h-5" width="w-24" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
