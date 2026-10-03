/**
 * /bottleneck — Bottlenecks (approved prototype `bottlenecks()`, view 27).
 *
 * RSC entry: the header with "View evidence", one strip of three tiles (WIP Saturation, Blocked
 * Work, Review Latency), the WIP note, the Review Load × Review Latency quadrant, the review wait
 * density heatmap and the WIP associations as meter rows. Tiles, dots, cells and the associations
 * card open the one shared evidence drawer.
 */

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { DataNote } from "@/components/charts/DataNote";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { associationMeterRows } from "@/components/metrics/associationRows";
import { MetricEvidenceButton } from "@/components/metrics/MetricEvidenceButton";
import { MeterRows } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { WipSaturationNotice } from "@/components/work/WipSaturationNotice";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { formatMetricParts } from "@/lib/formatters";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";
import { FALLBACK_DELTAS, getMetricLabel } from "@/lib/metrics/catalog";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { BOTTLENECK_TILES, BottleneckTiles } from "./BottleneckTiles";

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

    const [health, home, wipExplain, reviewQuadrant, reviewHeatmap] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getHomeDataViaGraphQL(filters), "bottleneck/home-data"),
        fetchOrNull(
            getExplainData({ metric: "wip_saturation", filters }),
            "bottleneck/explain-wip_saturation",
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
    // The way back to this page (scope and role kept): the drawer footer and "Return to
    // investigation" on the metric evidence page lead here.
    const pagePath = withFilterParam("/bottleneck", filters, activeRole);

    // "View evidence": the page's served tile values, as the tiles show them.
    const pageFacts: PageFact[] = BOTTLENECK_TILES.map(({ metric }) => {
        const row = deltas.find((item) => item.metric === metric);
        const parts =
            !placeholderDeltas && row?.value !== undefined
                ? formatMetricParts(row.value, row.unit ?? "")
                : null;
        return {
            label: row?.label ?? getMetricLabel(metric),
            // As the tile shows it: the number, then the unit ("298%", "0.3 hours").
            value: parts
                ? parts.unit === "%"
                    ? `${parts.value}%`
                    : [parts.value, parts.unit].filter(Boolean).join(" ")
                : undefined,
        };
    });

    const wipDrivers = (wipExplain?.drivers ?? []).slice(0, 10);
    const wipDriverLabels = resolveEntityLabels(
        wipDrivers.map((driver) => driver.label),
        { unresolvedFallback: "Unresolved" },
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Bottlenecks"
                subtitle="WIP saturation, review latency, and blocked work in one view."
                actions={<PageFactsEvidenceAction title="Bottlenecks" facts={pageFacts} />}
            />

            <ScopeBar view="work" origin={activeOrigin} />

            <BottleneckTiles
                deltas={deltas}
                placeholderDeltas={placeholderDeltas}
                filters={filters}
                role={activeRole}
                origin={pagePath}
            />

            <WipSaturationNotice />

            {/* The one quadrant the prototype draws. WIP × Throughput is the Throughput tab's
                quadrant on Flow (/metrics?tab=throughput). */}
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

            {/* Review wait density heatmap: a cell opens the shared drawer. */}
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

            {/* Prototype `section('WIP associations', bars(...))`: meter rows; the drawer lists the
                drivers with their evidence links, its footer leads to the WIP evidence page. */}
            <Section
                data-testid="wip-associations"
                title="WIP associations"
                description="Association changes in the selected window; not causal attribution."
                action={
                    <MetricEvidenceButton
                        subject={{
                            title: wipExplain?.label ?? getMetricLabel("wip_saturation"),
                            metric: "wip_saturation",
                            filters,
                            role: activeRole,
                            origin: pagePath,
                        }}
                        section="WIP associations"
                    />
                }
            >
                {wipDrivers.length ? (
                    <MeterRows
                        aria-label="WIP associations"
                        testId="wip-association-meter-rows"
                        rows={associationMeterRows(wipDrivers, wipDriverLabels)}
                    />
                ) : (
                    <p className="text-sm text-(--ink-muted)">
                        WIP association detail will appear once data is ingested.
                    </p>
                )}
                <DataNote>
                    Association values are percent change in the selected window; no causal
                    conclusion is added.
                </DataNote>
            </Section>
        </div>
    );
}
