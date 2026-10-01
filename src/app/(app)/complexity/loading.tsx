import { SkeletonChart } from "@/components/ui/Skeleton";

export default function Loading() {
    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 animate-pulse">
                <div className="space-y-2">
                    <div className="h-3 bg-(--card-70) rounded w-24" />
                    <div className="h-8 bg-(--card-70) rounded w-72" />
                    <div className="h-4 bg-(--card-70) rounded w-64" />
                    <div className="h-4 bg-(--card-70) rounded w-56" />
                </div>
                <div className="h-8 bg-(--card-70) rounded-full w-36" />
            </div>

            {/* Context strip */}
            <div className="h-10 bg-(--card-70) rounded-2xl animate-pulse" />

            {/* KPI tiles */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 animate-pulse">
                {Array.from({ length: 3 }, (_, index) => `kpi-skeleton-${index}`).map((key) => (
                    <div
                        key={key}
                        className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 space-y-3"
                    >
                        <div className="h-3 bg-(--card-70) rounded w-20" />
                        <div className="h-8 bg-(--card-70) rounded w-14" />
                        <div className="h-3 bg-(--card-70) rounded w-12" />
                    </div>
                ))}
            </div>

            {/* Trend chart */}
            <SkeletonChart height="h-80" />

            {/* Hotspot treemap */}
            <SkeletonChart height="h-96" />

            {/* Drilldown table */}
            <SkeletonChart height="h-64" />
        </div>
    );
}
