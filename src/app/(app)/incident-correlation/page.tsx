/**
 * /incident-correlation — DORA change-failure root cause surface (CHAOS-1746).
 *
 * RSC entry. Composes existing primitives:
 *   - REST  getHomeData(filters)                    → change_failure_rate + other DORA deltas
 *   - REST  getExplainData("change_failure_rate")   → drivers + contributors
 *   - GQL   WORK_GRAPH_EDGES_QUERY (edgeType DEPLOYS)          → PR→deployment edges
 *   - GQL   WORK_GRAPH_EDGES_QUERY (edgeType LINKED_INCIDENT)  → deployment→incident edges
 *
 * V1 limitations (also documented in PR body):
 *   1. No time-windowed edge filter — WorkGraphEdgeFilterInput schema does not support it.
 *      Both edge fetches use limit: 500 (resolver cap) with no time predicate.
 *   2. No multi-week deployments-vs-incidents trend chart — no backend aggregate endpoint.
 *      V1 renders the change_failure_rate spark from getHomeData instead.
 *      Follow-up: CHAOS-1757 to add ops incidentCorrelationTimeseries resolver.
 *   3. No automatic edge refresh — edge data is as fresh as the last sync run.
 */

import { IncidentCorrelationDashboard } from "@/components/incident-correlation/IncidentCorrelationDashboard";
import type { WorkGraphEdge } from "@/components/incident-correlation/IncidentCorrelationDashboard";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData } from "@/lib/api/home";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { graphqlFetch } from "@/lib/graphql/server";
import { WORK_GRAPH_EDGES_QUERY } from "@/lib/graphql/queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type WorkGraphEdgesResponse = {
    workGraphEdges: {
        edges: WorkGraphEdge[];
        totalCount: number;
        pageInfo: {
            hasNextPage: boolean;
            hasPreviousPage: boolean;
            startCursor: string | null;
            endCursor: string | null;
        };
    };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchEdges(
    orgId: string,
    edgeType: "DEPLOYS" | "LINKED_INCIDENT",
): Promise<WorkGraphEdge[]> {
    try {
        const data = await graphqlFetch<WorkGraphEdgesResponse>(
            WORK_GRAPH_EDGES_QUERY,
            { orgId, filters: { edgeType, limit: 500 } },
            { orgId },
        );
        return data.workGraphEdges?.edges ?? [];
    } catch (err) {
        // Surface as empty state rather than crashing; the dashboard already shows
        // a populated empty-state message.
        console.warn("workGraphEdges query failed", { edgeType }, err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function IncidentCorrelationPage({ searchParams }: PageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};

    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;

    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const orgId = session.user?.org_id ?? "demo-org";

    // Run all fetches in parallel to eliminate waterfall
    const [health, home, explain, deploysEdges, incidentEdges] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getHomeDataViaGraphQL(filters), "incident-correlation/home-data"),
        fetchOrNull(
            getExplainData({ metric: "change_failure_rate", filters }),
            "incident-correlation/explain-cfr",
        ),
        fetchEdges(orgId, "DEPLOYS"),
        fetchEdges(orgId, "LINKED_INCIDENT"),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8" data-testid="incident-correlation-page">
            <PageHeader
                title="Incident Correlation"
                subtitle="Connect DORA change-failure signals to PR, deployment, and incident evidence."
            >
                <p className="text-sm text-(--ink-muted)">
                    Open a metric or incident row to investigate.
                </p>
            </PageHeader>

            <ScopeBar pageFilters={false} origin={activeOrigin} />
            <IncidentCorrelationDashboard
                orgId={orgId}
                deltas={home?.deltas ?? []}
                drivers={explain?.drivers ?? []}
                contributors={explain?.contributors ?? []}
                explainUnit={explain?.unit}
                deploysEdges={deploysEdges}
                incidentEdges={incidentEdges}
                filters={filters}
                role={activeRole}
            />
        </div>
    );
}
