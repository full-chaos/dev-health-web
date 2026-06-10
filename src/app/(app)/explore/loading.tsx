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
                    <div className="flex flex-wrap items-start justify-between gap-4 animate-pulse">
                        <div className="space-y-2">
                            <div className="h-3 bg-(--card-70) rounded w-16" />
                            <div className="h-8 bg-(--card-70) rounded w-56" />
                            <div className="h-4 bg-(--card-70) rounded w-48" />
                            <div className="h-4 bg-(--card-70) rounded w-40" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-8 bg-(--card-70) rounded-full w-28" />
                            ))}
                        </div>
                    </div>

                    {/* Condensed filter bar */}
                    <div className="h-10 bg-(--card-70) rounded-full animate-pulse" />

                    {/* Context strip — metric label + active filters */}
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 animate-pulse">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-2">
                                <div className="h-3 bg-(--card-70) rounded w-16" />
                                <div className="h-5 bg-(--card-70) rounded w-40" />
                            </div>
                            <div className="h-3 bg-(--card-70) rounded w-20" />
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                            <div className="space-y-2">
                                <div className="h-4 bg-(--card-70) rounded w-full" />
                                <div className="h-4 bg-(--card-70) rounded w-3/4" />
                                <div className="h-3 bg-(--card-70) rounded w-56 mt-2" />
                            </div>
                            <div className="space-y-2">
                                <div className="h-3 bg-(--card-70) rounded w-24" />
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="h-6 bg-(--card-70) rounded-full w-20"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Evidence: Snapshot + Top Associations + Contributors (3-col grid) */}
                    <div className="grid gap-6 lg:grid-cols-3 animate-pulse">
                        {/* Snapshot card */}
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 space-y-3">
                            <div className="h-3 bg-(--card-70) rounded w-20" />
                            <div className="h-9 bg-(--card-70) rounded w-24" />
                            <div className="h-4 bg-(--card-70) rounded w-40" />
                            <div className="h-3 bg-(--card-70) rounded w-48" />
                        </div>

                        {/* Top Associations card */}
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="h-6 bg-(--card-70) rounded w-36" />
                                <div className="h-3 bg-(--card-70) rounded w-24" />
                            </div>
                            <div className="h-24 bg-(--card-70) rounded-2xl" />
                            <div className="space-y-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-9 bg-(--card-70) rounded-2xl" />
                                ))}
                            </div>
                        </div>

                        {/* Contributors card */}
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="h-6 bg-(--card-70) rounded w-28" />
                                <div className="h-3 bg-(--card-70) rounded w-24" />
                            </div>
                            <div className="h-24 bg-(--card-70) rounded-2xl" />
                            <div className="space-y-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-9 bg-(--card-70) rounded-2xl" />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Evidence shortcuts */}
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 animate-pulse">
                        <div className="h-6 bg-(--card-70) rounded w-40 mb-3" />
                        <div className="flex flex-wrap gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-8 bg-(--card-70) rounded-full w-28" />
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
