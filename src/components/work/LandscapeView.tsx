"use client";

import Link from "next/link";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { InvestmentChart } from "@/components/investment/InvestmentChart";
import { MetricCard } from "@/components/metrics/MetricCard";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { MetricDelta, QuadrantResponse, InvestmentResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";

type LandscapeViewProps = {
    filters: MetricFilter;
    activeRole?: string;
    deltas: MetricDelta[];
    placeholderDeltas: boolean;
    investment: InvestmentResponse | null;
    nested: {
        categories: Array<{ key: string; name: string; value: number }>;
        subtypes: Array<{ name: string; value: number; parentKey: string }>;
    };
    cycleThroughput: QuadrantResponse | null;
    wipThroughput: QuadrantResponse | null;
    reviewLoadLatency: QuadrantResponse | null;
    planned: { value: number } | null;
    unplanned: { value: number } | null;
    plannedPct: number | null;
    unplannedPct: number | null;
};

export function LandscapeView({
    filters,
    activeRole,
    deltas,
    placeholderDeltas,
    nested,
    cycleThroughput,
    wipThroughput,
    reviewLoadLatency,
    planned,
    unplanned,
    plannedPct,
    unplannedPct,
}: LandscapeViewProps) {
    const getMetric = (metric: string) =>
        deltas.find((item) => item.metric === metric);

    const wipMetric = getMetric("wip_saturation");

    return (
        <div className="flex flex-col gap-8">
            <section className="grid gap-4 lg:grid-cols-3">
                <MetricCard
                    label={wipMetric?.label ?? "WIP"}
                    href={buildExploreUrl({ metric: "wip_saturation", filters, role: activeRole })}
                    value={placeholderDeltas ? undefined : wipMetric?.value}
                    unit={wipMetric?.unit}
                    delta={placeholderDeltas ? undefined : wipMetric?.delta_pct}
                    spark={wipMetric?.spark}
                    caption="WIP saturation"
                />
                <MetricCard
                    label={getMetric("blocked_work")?.label ?? "Blocked"}
                    href={buildExploreUrl({ metric: "blocked_work", filters, role: activeRole })}
                    value={placeholderDeltas ? undefined : getMetric("blocked_work")?.value}
                    unit={getMetric("blocked_work")?.unit}
                    delta={placeholderDeltas ? undefined : getMetric("blocked_work")?.delta_pct}
                    spark={getMetric("blocked_work")?.spark}
                    caption="Blocked work"
                />
                <MetricCard
                    label={getMetric("throughput")?.label ?? "Throughput"}
                    href={buildExploreUrl({ metric: "throughput", filters, role: activeRole })}
                    value={placeholderDeltas ? undefined : getMetric("throughput")?.value}
                    unit={getMetric("throughput")?.unit}
                    delta={placeholderDeltas ? undefined : getMetric("throughput")?.delta_pct}
                    spark={getMetric("throughput")?.spark}
                    caption="Delivery volume"
                />
            </section>

            <section className="flex flex-col gap-6">
                <QuadrantPanel
                    title="Elapsed Time × Throughput"
                    description="Highlight delivery momentum under elapsed time pressure."
                    data={cycleThroughput}
                    filters={filters}
                    relatedLinks={[
                        {
                            label: "Open landscapes",
                            href: withFilterParam("/explore/landscape", filters, activeRole),
                        },
                    ]}
                    emptyState="Quadrant data unavailable for this scope."
                />
                <QuadrantPanel
                    title="WIP × Throughput"
                    description="Read product direction and role clarity under load."
                    data={wipThroughput}
                    filters={filters}
                    relatedLinks={[
                        {
                            label: "Open landscapes",
                            href: withFilterParam("/explore/landscape", filters, activeRole),
                        },
                    ]}
                    emptyState="Quadrant data unavailable for this scope."
                />
                <QuadrantPanel
                    title="Review Load × Review Latency"
                    description="Highlight collaboration health and ownership distribution under review pressure."
                    data={reviewLoadLatency}
                    filters={filters}
                    relatedLinks={[
                        {
                            label: "Open landscapes",
                            href: withFilterParam("/explore/landscape", filters, activeRole),
                        },
                    ]}
                    emptyState="Quadrant data unavailable for this scope."
                />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-(--font-display) text-xl">Investment Mix</h2>
                        <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                            <Link href={withFilterParam("/work?tab=flow", filters, activeRole)}>
                                View flow
                            </Link>
                            <Link href={buildExploreUrl({ metric: "throughput", filters, role: activeRole })}>
                                Inspect causes
                            </Link>
                        </div>
                    </div>
                    <div className="mt-4">
                        {nested.categories.length ? (
                            <InvestmentChart categories={nested.categories} subtypes={nested.subtypes} />
                        ) : (
                            <div className="flex h-[280px] items-center justify-center rounded-3xl border border-(--card-stroke) bg-(--card-60) text-sm text-(--ink-muted)">
                                Investment data unavailable.
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="font-(--font-display) text-xl">Planned vs Unplanned</h2>
                        <Link
                            href={withFilterParam("/work?tab=flow", filters, activeRole)}
                            className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                        >
                            View flow
                        </Link>
                    </div>
                    {planned && unplanned ? (
                        <div className="mt-4 space-y-4">
                            <div className="rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Planned
                                </p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {formatPercent((plannedPct ?? 0) * 100)}
                                </p>
                                <p className="mt-2 text-xs text-(--ink-muted)">
                                    {formatNumber(planned.value)} units
                                </p>
                            </div>
                            <div className="rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Unplanned
                                </p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {formatPercent((unplannedPct ?? 0) * 100)}
                                </p>
                                <p className="mt-2 text-xs text-(--ink-muted)">
                                    {formatNumber(unplanned.value)} units
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4 text-sm text-(--ink-muted)">
                            Planned vs unplanned requires tagged work categories.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
