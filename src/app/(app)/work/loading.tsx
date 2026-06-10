import { SkeletonChart } from "@/components/ui/Skeleton";

function NavSkeleton() {
    return (
        <aside className="w-full md:max-w-[220px] md:shrink-0 animate-pulse">
            <div className="sticky top-10 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-10 bg-(--card-70) rounded-2xl" />
                ))}
            </div>
        </aside>
    );
}

export default function Loading() {
    return (
        <div className="min-h-screen text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <NavSkeleton />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 animate-pulse">
                        <div className="space-y-2">
                            <div className="h-3 bg-(--card-70) rounded w-12" />
                            <div className="h-8 bg-(--card-70) rounded w-64" />
                            <div className="h-4 bg-(--card-70) rounded w-56" />
                            <div className="h-4 bg-(--card-70) rounded w-44" />
                        </div>
                        <div className="h-8 bg-(--card-70) rounded-full w-36" />
                    </div>

                    {/* Filter bar */}
                    <div className="h-10 bg-(--card-70) rounded-full animate-pulse" />

                    {/* Tab nav: Landscape / Heatmap / Flow / Investment / Capacity / Flame / Evidence / Graph */}
                    <div className="flex flex-wrap gap-2 animate-pulse">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-8 bg-(--card-70) rounded-full w-24" />
                        ))}
                    </div>

                    {/* Context strip */}
                    <div className="h-10 bg-(--card-70) rounded-2xl animate-pulse" />

                    {/* Primary chart area — large quadrant / landscape view */}
                    <SkeletonChart height="h-80" />

                    {/* Secondary charts or metric summary */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        <SkeletonChart height="h-56" />
                        <SkeletonChart height="h-56" />
                    </div>

                    {/* Investment mix / summary cards */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-pulse">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="rounded-3xl border border-(--border) bg-(--card) p-5 space-y-3"
                            >
                                <div className="h-3 bg-(--card-70) rounded w-20" />
                                <div className="h-8 bg-(--card-70) rounded w-14" />
                                <div className="h-3 bg-(--card-70) rounded w-12" />
                            </div>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
}
