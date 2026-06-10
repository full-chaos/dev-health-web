import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { MetricEvidenceCards } from "@/components/metrics/MetricEvidenceCards";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { getQuadrant } from "@/lib/api/visuals";
import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

type MetricsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type QuadrantType = "churn_throughput" | "cycle_throughput" | "wip_throughput";

type MetricTab = {
    id: string;
    label: string;
    description: string;
    metrics: string[];
    highlight: string;
    quadrant: {
        type: QuadrantType;
        title: string;
        description: string;
    };
};

const METRIC_TABS: MetricTab[] = [
    {
        id: "dora",
        label: "DORA",
        description: "Release speed and stability.",
        metrics: ["deploy_freq", "cycle_time", "change_failure_rate", "review_latency"],
        highlight: "deploy_freq",
        quadrant: {
            type: "churn_throughput",
            title: "Churn × Throughput landscape",
            description: "Operating modes under change volume and delivery pace.",
        },
    },
    {
        id: "flow",
        label: "Flow",
        description: "From idea to merge.",
        metrics: ["cycle_time", "review_latency", "throughput", "wip_saturation"],
        highlight: "cycle_time",
        quadrant: {
            type: "cycle_throughput",
            title: "Cycle Time × Throughput landscape",
            description: "Coordination debt and delivery efficiency.",
        },
    },
    {
        id: "throughput",
        label: "Throughput",
        description: "Delivery volume and pacing.",
        metrics: ["throughput", "deploy_freq", "wip_saturation", "blocked_work"],
        highlight: "throughput",
        quadrant: {
            type: "wip_throughput",
            title: "WIP × Throughput landscape",
            description: "Work-in-progress saturation and delivery capacity.",
        },
    },
];

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric) ??
    FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function MetricsPage({ searchParams }: MetricsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeTab = METRIC_TABS.find((tab) => tab.id === tabParam) ?? METRIC_TABS[0];

    const quadrantScope: "org" | "team" | "repo" | "developer" =
        filters.scope.level === "developer"
            ? "developer"
            : filters.scope.level === "team" || filters.scope.level === "repo"
              ? filters.scope.level
              : "org";

    // Run health check in parallel with all data fetches to eliminate the waterfall.
    const [health, home, highlight, quadrant] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getHomeData(filters), "metrics/home-data"),
        fetchOrNull(
            getExplainData({ metric: activeTab.highlight, filters }),
            `metrics/explain-${activeTab.highlight}`,
        ),
        fetchOrNull(
            getQuadrant({
                type: activeTab.quadrant.type,
                scope_type: quadrantScope,
                scope_id: filters.scope.ids[0] ?? "",
                range_days: filters.time.range_days,
                bucket: "week",
                start_date: filters.time.start_date,
                end_date: filters.time.end_date,
            }),
            "metrics/quadrant",
        ),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;
    const highlightMetric = getMetric(deltas, activeTab.highlight);
    const highlightLabel = highlightMetric?.label ?? activeTab.highlight;

    const drivers = (highlight?.drivers ?? []).slice(0, 5);
    const contributors = (highlight?.contributors ?? []).slice(0, 5);
    // Render-safe association labels (A7): raw ids degrade to stable short
    // tokens; the full label remains in the axis tooltip title.
    const driverChartLabels = resolveEntityLabels(
        drivers.map((d) => d.label),
        { unresolvedFallback: "Unresolved" },
    );
    const contributorChartLabels = resolveEntityLabels(
        contributors.map((c) => c.label),
        { unresolvedFallback: "Unresolved" },
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="metrics" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Metrics
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Monitoring view</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Trends over the selected window.
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Open a metric to investigate.
                            </p>
                        </div>
                        <BackLink href={withFilterParam("/", filters, activeRole)} />
                    </header>

                    <GlobalContextBar filters={filters} />
                    <FilterBar view="metrics" tab={activeTab.id} />

                    <ModeTabs
                        ariaLabel="Metrics views"
                        activeId={activeTab.id}
                        items={METRIC_TABS.map(
                            (tab): ModeTabItem => ({
                                id: tab.id,
                                label: tab.label,
                                href: withFilterParam(
                                    `/metrics?tab=${tab.id}`,
                                    filters,
                                    activeRole,
                                ),
                            }),
                        )}
                    />

                    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    {activeTab.label} monitoring
                                </p>
                                <p className="mt-1 text-sm text-(--ink-muted)">
                                    {activeTab.description}
                                </p>
                            </div>
                            <Link
                                href={buildExploreUrl({
                                    metric: activeTab.highlight,
                                    filters,
                                    role: activeRole,
                                })}
                                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                                title={`Open evidence for ${highlightLabel}`}
                            >
                                {CTA_LABELS.openEvidence}
                            </Link>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            {activeTab.metrics.map((metric) => {
                                const data = getMetric(deltas, metric);
                                return (
                                    <Link
                                        key={`chip-${metric}`}
                                        href={buildExploreUrl({
                                            metric,
                                            filters,
                                            role: activeRole,
                                        })}
                                        className="rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--ink-muted) transition hover:text-foreground"
                                    >
                                        {data?.label ?? metric}
                                    </Link>
                                );
                            })}
                        </div>
                    </section>

                    <MetricEvidenceCards
                        metrics={activeTab.metrics}
                        deltas={deltas}
                        filters={filters}
                        activeRole={activeRole}
                        placeholderDeltas={placeholderDeltas}
                    />

                    <section>
                        <QuadrantPanel
                            title={activeTab.quadrant.title}
                            description={activeTab.quadrant.description}
                            data={quadrant}
                            filters={filters}
                            emptyState="Quadrant data unavailable for this scope."
                        />
                    </section>

                    <section className="grid gap-6 lg:grid-cols-2">
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">
                                    Likely associations
                                </h2>
                                <Link
                                    href={buildExploreUrl({
                                        metric: activeTab.highlight,
                                        filters,
                                        role: activeRole,
                                    })}
                                    className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                                >
                                    {CTA_LABELS.openEvidence}
                                </Link>
                            </div>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                                Preview of the selected window. Select a data point for detail.
                            </p>
                            {drivers.length ? (
                                <div className="mt-4 space-y-4">
                                    <HorizontalBarChart
                                        categories={driverChartLabels.labels}
                                        values={drivers.map((driver) => Math.abs(driver.delta_pct))}
                                        categoryTitles={driverChartLabels.titles}
                                    />
                                    <div className="space-y-2 text-sm">
                                        {drivers.map((driver) => (
                                            <Link
                                                key={driver.id}
                                                href={buildExploreUrl({
                                                    api: driver.evidence_link,
                                                    filters,
                                                    role: activeRole,
                                                })}
                                                className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                                            >
                                                <EntityLabel id={driver.label} />
                                                <span className="text-xs text-(--ink-muted)">
                                                    {formatDelta(driver.delta_pct)}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-(--ink-muted)">
                                    Association detail will appear once data is ingested.
                                </p>
                            )}
                        </div>

                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">
                                    Primary contributors
                                </h2>
                                <Link
                                    href={buildExploreUrl({
                                        metric: activeTab.highlight,
                                        filters,
                                        role: activeRole,
                                    })}
                                    className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                                >
                                    {CTA_LABELS.openEvidence}
                                </Link>
                            </div>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                                Where the impact concentrates in this window.
                            </p>
                            {contributors.length ? (
                                <div className="mt-4 space-y-4">
                                    <HorizontalBarChart
                                        categories={contributorChartLabels.labels}
                                        values={contributors.map(
                                            (contributor) => contributor.value,
                                        )}
                                        categoryTitles={contributorChartLabels.titles}
                                    />
                                    <div className="space-y-2 text-sm">
                                        {contributors.map((contributor) => (
                                            <Link
                                                key={contributor.id}
                                                href={buildExploreUrl({
                                                    api: contributor.evidence_link,
                                                    filters,
                                                    role: activeRole,
                                                })}
                                                className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                                            >
                                                <EntityLabel id={contributor.label} />
                                                <span className="text-xs text-(--ink-muted)">
                                                    {highlight
                                                        ? formatMetricValue(
                                                              contributor.value,
                                                              highlight.unit,
                                                          )
                                                        : "--"}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-(--ink-muted)">
                                    Contributor detail will appear once data is ingested.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-(--font-display) text-xl">Summary</h2>
                            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                Active window
                            </span>
                        </div>
                        <div className="mt-4 overflow-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <thead className="text-left text-(--ink-muted)">
                                    <tr>
                                        <th className="border-b border-(--card-stroke) pb-2">
                                            Metric
                                        </th>
                                        <th className="border-b border-(--card-stroke) pb-2">
                                            Current
                                        </th>
                                        <th className="border-b border-(--card-stroke) pb-2">
                                            Delta
                                        </th>
                                        <th className="border-b border-(--card-stroke) pb-2">
                                            Explore
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTab.metrics.map((metric) => {
                                        const data = getMetric(deltas, metric);
                                        const href = buildExploreUrl({
                                            metric,
                                            filters,
                                            role: activeRole,
                                        });
                                        return (
                                            <tr
                                                key={metric}
                                                className="border-b border-(--card-stroke)"
                                            >
                                                <td className="py-3 pr-4 font-medium">
                                                    <Link href={href} className="block">
                                                        {data?.label ?? metric}
                                                    </Link>
                                                </td>
                                                <td className="py-3 pr-4 text-(--ink-muted)">
                                                    <Link href={href} className="block">
                                                        {placeholderDeltas || !data
                                                            ? "--"
                                                            : formatMetricValue(
                                                                  data.value,
                                                                  data.unit,
                                                              )}
                                                    </Link>
                                                </td>
                                                <td className="py-3 pr-4 text-(--ink-muted)">
                                                    <Link href={href} className="block">
                                                        {placeholderDeltas || !data ? (
                                                            <span title="No prior period available to compute a change">
                                                                No prior period
                                                            </span>
                                                        ) : (
                                                            formatDelta(data.delta_pct)
                                                        )}
                                                    </Link>
                                                </td>
                                                <td className="py-3 text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                                                    <Link href={href} className="block">
                                                        {CTA_LABELS.openInExplore}
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
