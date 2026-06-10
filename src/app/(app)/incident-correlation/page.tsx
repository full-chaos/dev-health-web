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

import Link from "next/link";

import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { IncidentCorrelationDashboard } from "@/components/incident-correlation/IncidentCorrelationDashboard";
import type { WorkGraphEdge } from "@/components/incident-correlation/IncidentCorrelationDashboard";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { withFilterParam } from "@/lib/filters/url";
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
        fetchOrNull(getHomeData(filters), "incident-correlation/home-data"),
        fetchOrNull(
            getExplainData({ metric: "change_failure_rate", filters }),
            "incident-correlation/explain-cfr",
        ),
        fetchEdges(orgId, "DEPLOYS"),
        fetchEdges(orgId, "LINKED_INCIDENT"),
    ]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="incident-correlation" role={activeRole} />
                <main
                    className="flex min-w-0 flex-1 flex-col gap-8"
                    data-testid="incident-correlation-page"
                >
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Investigate
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">
                                Incident Correlation
                            </h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Connect DORA change-failure signals to PR, deployment, and incident
                                evidence.
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Open a metric or incident row to investigate.
                            </p>
                        </div>
                        <Link
                            href={withFilterParam("/", filters, activeRole)}
                            className="rounded-full border border-(--border) px-4 py-2 text-xs uppercase tracking-[0.2em]"
                        >
                            Back to cockpit
                        </Link>
                    </header>

                    <ContextStrip filters={filters} origin={activeOrigin} />

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
                </main>
            </div>
        </div>
    );
}
