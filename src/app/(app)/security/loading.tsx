import { SkeletonLine } from "@/components/ui/Skeleton";

export default function SecurityLoading() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                {/* Nav skeleton */}
                <div className="w-full md:max-w-[220px] md:shrink-0">
                    <div className="rounded-3xl border border-(--border) bg-(--card-80) p-4">
                        <SkeletonLine height="h-4" width="w-3/4" />
                        <SkeletonLine height="h-6" width="w-1/2" />
                        <div className="mt-4 space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <SkeletonLine key={i} height="h-8" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main content skeleton */}
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <div className="space-y-2">
                        <SkeletonLine height="h-3" width="w-24" />
                        <SkeletonLine height="h-8" width="w-48" />
                        <SkeletonLine height="h-4" width="w-80" />
                    </div>

                    {/* KPI tiles skeleton */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex flex-col gap-2 rounded-2xl border border-(--border) bg-card px-5 py-4"
                            >
                                <SkeletonLine height="h-3" width="w-1/2" />
                                <SkeletonLine height="h-8" width="w-1/3" />
                            </div>
                        ))}
                    </div>

                    {/* Charts skeleton */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-(--border) bg-card p-4">
                            <SkeletonLine height="h-48" />
                        </div>
                        <div className="rounded-2xl border border-(--border) bg-card p-4">
                            <SkeletonLine height="h-48" />
                        </div>
                    </div>

                    {/* Trend chart skeleton */}
                    <div className="rounded-2xl border border-(--border) bg-card p-4">
                        <SkeletonLine height="h-64" />
                    </div>

                    {/* Table skeleton */}
                    <div className="rounded-2xl border border-(--border) bg-card">
                        <div className="p-4">
                            <SkeletonLine height="h-10" />
                        </div>
                        <div className="divide-y divide-(--border)">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="flex gap-3 px-3 py-3">
                                    <SkeletonLine height="h-5" width="w-16" />
                                    <SkeletonLine height="h-5" width="w-20" />
                                    <SkeletonLine height="h-5" />
                                    <SkeletonLine height="h-5" width="w-24" />
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
