/**
 * /complexity — Complexity Trends surface (CHAOS-1745).
 *
 * RSC entry. Pre-fetches complexityTimeseries + hotspots via GraphQL (CHAOS-1756)
 * and renders ComplexityDashboard with KPI tiles, trend chart, hotspot treemap,
 * and drilldown table.
 *
 * Default window: last 90 days; granularity: WEEK; scope: REPO; limit: 10 repos,
 * 50 hotspot rows.
 */

import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { ComplexityDashboard } from "@/components/complexity/ComplexityDashboard";
import type {
    ComplexityPoint,
    ComplexityTab,
    HotspotRow,
} from "@/components/complexity/ComplexityDashboard";
import { FlameView } from "@/components/work/FlameView";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { graphqlFetch } from "@/lib/graphql/server";
import { COMPLEXITY_TIMESERIES_QUERY, HOTSPOTS_QUERY } from "@/lib/graphql/queries";
import {
    complexityScopeInputFromFilter,
    complexityWindowFromFilter,
    type ComplexityScopeInput,
} from "@/lib/complexity/filters";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ComplexityTimeseriesResponse = {
    complexityTimeseries: {
        points: ComplexityPoint[];
        totalScope: number;
    };
};

type HotspotsResponse = {
    hotspots: {
        rows: HotspotRow[];
    };
};

// ---------------------------------------------------------------------------
// Data-fetching helpers
// ---------------------------------------------------------------------------

async function fetchComplexityTimeseries(
    orgId: string,
    sinceUtc: string,
    untilUtc: string,
    scopeInput: ComplexityScopeInput,
): Promise<ComplexityPoint[]> {
    try {
        const data = await graphqlFetch<ComplexityTimeseriesResponse>(
            COMPLEXITY_TIMESERIES_QUERY,
            {
                input: {
                    orgId,
                    sinceUtc,
                    untilUtc,
                    granularity: "DAY",
                    scope: "REPO",
                    ...scopeInput,
                    limit: 10,
                },
            },
            { orgId },
        );
        return data.complexityTimeseries?.points ?? [];
    } catch (err) {
        // Surface as empty state rather than crashing — the dashboard owns the UX.
        console.warn("complexityTimeseries query failed", err);
        return [];
    }
}

async function fetchHotspots(
    orgId: string,
    sinceUtc: string,
    untilUtc: string,
    scopeInput: ComplexityScopeInput,
): Promise<HotspotRow[]> {
    try {
        const data = await graphqlFetch<HotspotsResponse>(
            HOTSPOTS_QUERY,
            {
                input: {
                    orgId,
                    sinceUtc,
                    untilUtc,
                    ...scopeInput,
                    limit: 50,
                },
            },
            { orgId },
        );
        return data.hotspots?.rows ?? [];
    } catch (err) {
        console.warn("hotspots query failed", err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ComplexityPage({ searchParams }: PageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};

    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;

    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeTab = typeof tabParam === "string" ? tabParam : "overview";

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const tabs: ViewSetItem[] = [
        {
            id: "overview",
            label: "Overview",
            path: withFilterParam("/complexity", filters, activeRole),
            navVisible: true,
        },
        {
            id: "flame",
            label: "Flame",
            path: withFilterParam("/complexity?tab=flame", filters, activeRole),
            navVisible: true,
        },
        {
            id: "hotspots",
            label: "Hotspots",
            path: withFilterParam("/complexity?tab=hotspots", filters, activeRole),
            navVisible: true,
        },
        {
            id: "ownership-risk",
            label: "Ownership Risk",
            path: withFilterParam("/complexity?tab=ownership-risk", filters, activeRole),
            navVisible: true,
        },
        {
            id: "churn",
            label: "Churn",
            path: withFilterParam("/complexity?tab=churn", filters, activeRole),
            navVisible: true,
        },
    ];

    const orgId = session.user?.org_id ?? "demo-org";

    const { sinceUtc, untilUtc } = complexityWindowFromFilter(filters.time);
    const scopeInput = complexityScopeInputFromFilter(filters);

    // Parallel pre-fetch — both queries are independent
    const [points, hotspotRows] = await Promise.all([
        fetchComplexityTimeseries(orgId, sinceUtc, untilUtc, scopeInput),
        fetchHotspots(orgId, sinceUtc, untilUtc, scopeInput),
    ]);

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div
            className="flex min-w-0 flex-1 flex-col gap-8 text-foreground"
            data-testid="complexity-page"
        >
            <PageHeader
                title="Complexity Trends"
                subtitle="Code complexity over time, file hotspots, and high-risk areas."
            >
                <p className="text-sm text-(--ink-muted)">
                    Every score traces to cyclomatic complexity and churn evidence.
                </p>
            </PageHeader>

            <ScopeBar view="complexity" origin={activeOrigin} />

            <ViewSet
                orientation="tabs"
                items={tabs}
                activeId={activeTab}
                overviewId="overview"
                ariaLabel="Complexity views"
            />

            {activeTab === "flame" ? (
                <FlameView filters={filters} />
            ) : (
                <ComplexityDashboard
                    orgId={orgId}
                    points={points}
                    hotspotRows={hotspotRows}
                    activeTab={activeTab as ComplexityTab}
                />
            )}
        </div>
    );
}
