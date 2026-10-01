/**
 * /bottleneck — Bottlenecks.
 *
 * RSC entry. Pre-fetches WIP saturation + review latency data and renders
 * KPI tiles, WIP × Throughput quadrant, Review Load × Latency quadrant,
 * review wait density heatmap, and the WIP/blocked evidence panel.
 *
 * Mirrors the structure of /work (work/page.tsx) and /risk/compounding.
 */

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { EvidenceView } from "@/components/work/EvidenceView";
import { MetricCard } from "@/components/metrics/MetricCard";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type BottleneckPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function BottleneckPage({ searchParams }: BottleneckPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;

    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const scopeId = filters.scope.ids[0] ?? "";
    const quadrantScope: "org" | "team" | "repo" | "developer" =
        filters.scope.level === "developer"
            ? "developer"
            : filters.scope.level === "team" || filters.scope.level === "repo"
              ? filters.scope.level
              : "org";

    const [health, home, wipExplain, blockedExplain, wipQuadrant, reviewQuadrant, reviewHeatmap] =
        await Promise.all([
            checkApiHealth(),
            fetchOrNull(getHomeDataViaGraphQL(filters), "bottleneck/home-data"),
            fetchOrNull(
                getExplainData({ metric: "wip_saturation", filters }),
                "bottleneck/explain-wip_saturation",
            ),
            fetchOrNull(
                getExplainData({ metric: "blocked_work", filters }),
                "bottleneck/explain-blocked_work",
            ),
            fetchOrNull(
                getQuadrant({
                    type: "wip_throughput",
                    scope_type: quadrantScope,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    bucket: "week",
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }),
                "bottleneck/wip-throughput-quadrant",
            ),
            fetchOrNull(
                getQuadrant({
                    type: "review_load_latency",
                    scope_type: quadrantScope,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    bucket: "week",
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }),
                "bottleneck/review-load-latency-quadrant",
            ),
            fetchOrNull(
                getHeatmap({
                    type: "temporal_load",
                    metric: "review_wait_density",
                    scope_type: filters.scope.level,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }),
                "bottleneck/review-heatmap",
            ),
        ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
    const placeholderDeltas = !home?.deltas?.length;

    const getMetric = (metric: string) => deltas.find((item) => item.metric === metric);

    const wipMetric = getMetric("wip_saturation");
    const blockedMetric = getMetric("blocked_work");
    const reviewLatencyMetric = getMetric("review_latency");

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Bottlenecks"
                subtitle="WIP saturation, review latency, and blocked work in one view."
            >
                <p className="text-sm text-(--ink-muted)">
                    Where work is piling up and review is slowing delivery.
                </p>
            </PageHeader>

            <ScopeBar view="work" origin={activeOrigin} />

            {/* KPI tiles */}
            <section className="grid gap-4 lg:grid-cols-3">
                <MetricCard
                    label={wipMetric?.label ?? "WIP Saturation"}
                    href={buildExploreUrl({
                        metric: "wip_saturation",
                        filters,
                        role: activeRole,
                    })}
                    value={placeholderDeltas ? undefined : wipMetric?.value}
                    unit={wipMetric?.unit}
                    delta={placeholderDeltas ? undefined : wipMetric?.delta_pct}
                    spark={wipMetric?.spark}
                    caption="Work in progress"
                />
                <MetricCard
                    label={blockedMetric?.label ?? "Blocked Work"}
                    href={buildExploreUrl({
                        metric: "blocked_work",
                        filters,
                        role: activeRole,
                    })}
                    value={placeholderDeltas ? undefined : blockedMetric?.value}
                    unit={blockedMetric?.unit}
                    delta={placeholderDeltas ? undefined : blockedMetric?.delta_pct}
                    spark={blockedMetric?.spark}
                    caption="Blocked items"
                />
                <MetricCard
                    label={reviewLatencyMetric?.label ?? "Review Latency"}
                    href={buildExploreUrl({
                        metric: "review_latency",
                        filters,
                        role: activeRole,
                    })}
                    value={placeholderDeltas ? undefined : reviewLatencyMetric?.value}
                    unit={reviewLatencyMetric?.unit}
                    delta={placeholderDeltas ? undefined : reviewLatencyMetric?.delta_pct}
                    spark={reviewLatencyMetric?.spark}
                    caption="Time to first review"
                />
            </section>

            <p className="-mt-2 text-xs text-(--ink-muted)">
                WIP Saturation is indexed to a baseline of 100% (work in progress matched to typical
                throughput). Readings above 100% mean more work is open than the team usually clears
                in the window &mdash; e.g. 950% reads as ~9.5&times; the baseline, not a data error.
                Sustained readings far above 100% point to over-commitment, and the metric is
                intentionally uncapped so that severity stays visible.
            </p>

            {/* Quadrant panels */}
            <section className="grid gap-6">
                <QuadrantPanel
                    title="WIP × Throughput"
                    description="Operating modes under work in flight and delivery pace."
                    data={wipQuadrant}
                    filters={filters}
                    relatedLinks={[
                        {
                            label: "Explore work",
                            href: withFilterParam("/work", filters, activeRole),
                        },
                    ]}
                    emptyState="WIP saturation data will appear once work items are ingested."
                />
                <QuadrantPanel
                    title="Review Load × Review Latency"
                    description="Operating modes under review demand and turnaround."
                    data={reviewQuadrant}
                    filters={filters}
                    relatedLinks={[
                        {
                            label: "Explore work",
                            href: withFilterParam("/work", filters, activeRole),
                        },
                    ]}
                    emptyState="Review load data will appear once PR data is ingested."
                />
            </section>

            {/* Review wait density heatmap */}
            <HeatmapPanel
                title="Review wait density"
                description="Find the hours and weekdays where PRs accumulate review wait time."
                request={{
                    type: "temporal_load",
                    metric: "review_wait_density",
                    scope_type: filters.scope.level,
                    scope_id: scopeId,
                    range_days: filters.time.range_days,
                    start_date: filters.time.start_date,
                    end_date: filters.time.end_date,
                }}
                initialData={reviewHeatmap}
                emptyState="Review wait heatmap will appear once PR data is ingested."
                evidenceTitle="PR evidence"
            />

            {/* WIP and blocked work evidence panel */}
            <EvidenceView
                filters={filters}
                activeRole={activeRole}
                wipExplain={wipExplain}
                blockedExplain={blockedExplain}
            />
        </div>
    );
}
