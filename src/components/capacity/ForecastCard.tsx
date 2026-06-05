"use client";

import type { CapacityForecast } from "@/lib/graphql/types";

type ForecastCardProps = {
    forecast: CapacityForecast | null;
    loading?: boolean;
    error?: Error | null;
};

function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLowVarianceWeeks(days: number): string {
    const weeks = Math.max(1, Math.round(days / 7));
    return `≈${weeks} ${weeks === 1 ? "week" : "weeks"} (low variance)`;
}

function SkeletonCard() {
    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-6 animate-pulse">
            <div className="h-6 bg-(--card-70) rounded w-1/3 mb-4" />
            <div className="space-y-3">
                <div className="h-4 bg-(--card-70) rounded w-1/2" />
                <div className="h-4 bg-(--card-70) rounded w-2/3" />
                <div className="h-4 bg-(--card-70) rounded w-1/2" />
            </div>
        </div>
    );
}

function ErrorCard({ error }: { error: Error }) {
    return (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Forecast Unavailable</h3>
            <p className="text-sm text-red-400/80">{error.message}</p>
        </div>
    );
}

function EmptyCard() {
    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">No Forecast Available</h3>
            <p className="text-sm text-(--ink-muted)">
                Insufficient throughput history to generate a forecast. Need at least 14 days of
                data.
            </p>
        </div>
    );
}

export function ForecastCard({ forecast, loading, error }: ForecastCardProps) {
    if (loading) return <SkeletonCard />;
    if (error) return <ErrorCard error={error} />;
    if (!forecast) return <EmptyCard />;

    const { insufficientHistory, highVariance } = forecast;
    const hasLowVarianceForecast =
        typeof forecast.p50Days === "number" &&
        forecast.p50Days === forecast.p85Days &&
        forecast.p85Days === forecast.p95Days;

    const scopeLabel = forecast.workScopeId
        ? forecast.workScopeId
        : forecast.teamId
          ? `Team: ${forecast.teamId}`
          : "All Teams";

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
            <div className="mb-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground">Capacity Forecast</h3>
                </div>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Scope: <span className="font-medium text-foreground">{scopeLabel}</span>
                </p>
            </div>

            <div className="mb-4">
                <span className="text-sm text-(--ink-muted)">Backlog</span>
                <p className="text-2xl font-bold text-foreground">
                    {forecast.backlogSize} <span className="text-base font-normal">items</span>
                </p>
            </div>

            <div className="space-y-2 mb-4">
                {hasLowVarianceForecast ? (
                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                        <span className="text-sm text-(--ink-muted)">Forecast range</span>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">
                                {formatLowVarianceWeeks(forecast.p50Days ?? 0)}
                            </span>
                            <span className="text-xs text-(--ink-muted)">
                                {formatDate(forecast.p50Date)}
                            </span>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between py-2 border-b border-(--card-stroke)">
                            <span className="text-sm text-(--ink-muted)">50% chance</span>
                            <div className="text-right">
                                <span className="font-medium text-green-500">
                                    {formatDate(forecast.p50Date)}
                                </span>
                                {forecast.p50Days && (
                                    <span className="text-xs text-(--ink-muted) ml-2">
                                        ({forecast.p50Days} days)
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-(--card-stroke) bg-amber-500/10 -mx-2 px-2 rounded">
                            <span className="text-sm font-medium text-amber-400">85% chance</span>
                            <div className="text-right flex items-center">
                                <span className="font-bold text-amber-400">
                                    {formatDate(forecast.p85Date)}
                                </span>
                                {forecast.p85Days && (
                                    <span className="text-xs text-amber-400/70 ml-2">
                                        ({forecast.p85Days} days)
                                    </span>
                                )}
                                <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                                    Target
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-(--ink-muted)">95% chance</span>
                            <div className="text-right">
                                <span className="font-medium text-red-400">
                                    {formatDate(forecast.p95Date)}
                                </span>
                                {forecast.p95Days && (
                                    <span className="text-xs text-(--ink-muted) ml-2">
                                        ({forecast.p95Days} days)
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="pt-4 border-t border-(--card-stroke)">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-(--ink-muted)">Throughput</span>
                    <span className="text-foreground">
                        {forecast.throughputMean.toFixed(1)} ±{" "}
                        {forecast.throughputStddev.toFixed(1)}{" "}
                        <span className="text-(--ink-muted)">items/day</span>
                    </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-(--ink-muted)">History</span>
                    <span className="text-foreground">{forecast.historyDays} days</span>
                </div>
            </div>

            {(insufficientHistory || highVariance) && (
                <div className="mt-4 space-y-2">
                    {insufficientHistory && (
                        <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 p-2 rounded">
                            <span className="shrink-0">⚠️</span>
                            <span>Limited history available. Forecast may be less reliable.</span>
                        </div>
                    )}
                    {highVariance && (
                        <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 p-2 rounded">
                            <span className="shrink-0">⚠️</span>
                            <span>
                                High throughput variance detected. Consider using more history days.
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
