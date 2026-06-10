"use client";

export function SkeletonLine({
    width = "w-full",
    height = "h-4",
}: {
    width?: string;
    height?: string;
}) {
    return <div className={`${height} bg-(--card-70) rounded ${width} animate-pulse`} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-6 space-y-3 animate-pulse">
            <div className="h-6 bg-(--card-70) rounded w-1/3" />
            {Array.from({ length: lines }, (_, i) => (
                <div
                    key={`skeleton-line-${i}`}
                    className={`h-4 bg-(--card-70) rounded ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`}
                />
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="space-y-2 animate-pulse">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {Array.from({ length: cols }, (_, i) => (
                    <div key={`skeleton-header-${i}`} className="h-4 bg-(--card-70) rounded" />
                ))}
            </div>
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={`skeleton-row-${i}`}
                    className="grid gap-4"
                    style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                >
                    {Array.from({ length: cols }, (_, j) => (
                        <div
                            key={`skeleton-cell-${i}-${j}`}
                            className="h-4 bg-(--card-70) rounded"
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonChart({ height = "h-64" }: { height?: string }) {
    return (
        <div
            className={`${height} rounded-3xl border border-(--card-stroke) bg-card p-6 animate-pulse`}
        >
            <div className="h-5 bg-(--card-70) rounded w-1/4 mb-6" />
            <div className="h-full bg-(--card-70) rounded" />
        </div>
    );
}
