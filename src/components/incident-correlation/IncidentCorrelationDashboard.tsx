/**
 * IncidentCorrelationDashboard — client surface for /incident-correlation (CHAOS-1746).
 *
 * Renders:
 *   1. DORA KPI tiles — only for metrics actually present in home.deltas (no zero placeholders).
 *   2. Enlarged change_failure_rate sparkline (V1 trend — no multi-week chart, see CHAOS-1757).
 *   3. Drivers + Contributors (HorizontalBarChart from getExplainData).
 *   4. Linked incidents table — client-side join of DEPLOYS + LINKED_INCIDENT edges.
 *   5. SankeyChart — top N PRs → deployments → incidents (skipped when join is empty).
 *   6. Empty state mirroring CompoundingRiskDashboard voice.
 *
 * V1 limitations (documented in PR body):
 *   - No time-windowed edge filter (WorkGraphEdgeFilterInput schema doesn't support it).
 *   - No multi-week deployments-vs-incidents trend chart (no backend endpoint; follow-up CHAOS-1757).
 *   - Edges capped at limit: 500 per call.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { MetricCard } from "@/components/metrics/MetricCard";
import { DataState } from "@/components/ui/DataState";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type { Contributor, MetricDelta, SankeyLink, SankeyNode } from "@/lib/types";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";
import { hasRenderableSeries, isFiniteNumber } from "@/lib/guards/numbers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** WorkGraph edge — mirrors WORK_GRAPH_EDGES_QUERY field set exactly. */
export type WorkGraphEdge = {
    edgeId: string;
    sourceType: string;
    sourceId: string;
    /** Server-resolved human label for sourceId (A7). Null when backend could not resolve. */
    sourceDisplayName?: string | null;
    targetType: string;
    targetId: string;
    /** Server-resolved human label for targetId (A7). Null when backend could not resolve. */
    targetDisplayName?: string | null;
    edgeType: string;
    provenance: string | null;
    confidence: number | null;
    evidence: string | null;
    repoId: string | null;
    provider: string | null;
};

/**
 * Joined incident row: one incident with the deployments that triggered it and
 * the PRs that caused those deployments.
 *
 * Backend edge semantics (CHAOS-2119 correction):
 *   DEPLOYS:          sourceId = PR,         targetId = deployment
 *   LINKED_INCIDENT:  sourceId = deployment,  targetId = incident
 *
 * The Sankey therefore flows: PR → Deployment → Incident.
 */
export type IncidentRow = {
    incidentId: string;
    /** Server-resolved display name for incidentId. From LINKED_INCIDENT targetDisplayName. */
    incidentDisplayName?: string | null;
    /** Deployment IDs linked to this incident. From LINKED_INCIDENT sourceId. */
    deploymentIds: string[];
    /** PR IDs that caused the linked deployments. From DEPLOYS sourceId. */
    prIds: string[];
    /**
     * Server-resolved display names for deployment IDs (CHAOS-2119).
     * Populated from LINKED_INCIDENT edge sourceDisplayName (deployment name).
     */
    deploymentDisplayNames?: Record<string, string | null>;
    /**
     * Server-resolved display names for PR IDs (CHAOS-2119).
     * Populated from DEPLOYS edge sourceDisplayName (PR name).
     */
    prDisplayNames?: Record<string, string | null>;
};

export type IncidentCorrelationDashboardProps = {
    orgId: string;
    deltas: MetricDelta[];
    drivers: Contributor[];
    contributors: Contributor[];
    explainUnit?: string;
    deploysEdges: WorkGraphEdge[];
    incidentEdges: WorkGraphEdge[];
    filters: MetricFilter;
    role?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DORA metric keys we recognise — tiles rendered only when present in home.deltas. */
const DORA_METRIC_KEYS = ["change_failure_rate", "deployment_frequency", "mttr"] as const;

const MAX_SANKEY_INCIDENTS = 10;
const MAX_LINKS_PER_INCIDENT = 3;
const OPAQUE_LABEL_RE =
    /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasMeaningfulAssociations = (items: Contributor[]) =>
    items.some((item) => isFiniteNumber(item.delta_pct) && Math.abs(item.delta_pct) > 0);

// ---------------------------------------------------------------------------
// Pure join / transform helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Join DEPLOYS and LINKED_INCIDENT edge sets into incident-centric rows.
 *
 * Authoritative backend semantics (ops/work_graph/models.py, ai_workflow.py):
 *   DEPLOYS:          source = PR,         target = deployment
 *   LINKED_INCIDENT:  source = deployment,  target = incident
 *
 * Produced Sankey flow: PR → Deployment → Incident
 *
 * V1 limitation: no time-windowed filtering — schema doesn't support it.
 */
export function joinEdges(
    deploysEdges: WorkGraphEdge[],
    incidentEdges: WorkGraphEdge[],
): IncidentRow[] {
    // ── Step 1: LINKED_INCIDENT (deployment → incident) ─────────────────────
    // incidentId = targetId, deploymentId = sourceId
    const deploymentsByIncident = new Map<string, Set<string>>();
    const incidentDisplayNames = new Map<string, string | null>();
    // deployment display name: from LINKED_INCIDENT sourceDisplayName
    const deploymentDisplayNames = new Map<string, string | null>();

    for (const edge of incidentEdges) {
        const incidentId = edge.targetId;       // LINKED_INCIDENT target = incident
        const deploymentId = edge.sourceId;     // LINKED_INCIDENT source = deployment
        if (!deploymentsByIncident.has(incidentId)) {
            deploymentsByIncident.set(incidentId, new Set());
        }
        deploymentsByIncident.get(incidentId)!.add(deploymentId);

        // Incident display name from targetDisplayName.
        // First non-null value wins; null fills only if no entry yet.
        const incName = edge.targetDisplayName ?? null;
        if (!incidentDisplayNames.has(incidentId)) {
            incidentDisplayNames.set(incidentId, incName);
        } else if (incidentDisplayNames.get(incidentId) == null && incName != null) {
            incidentDisplayNames.set(incidentId, incName);
        }
        // Deployment display name from sourceDisplayName. First non-null wins.
        if (!deploymentDisplayNames.has(deploymentId)) {
            deploymentDisplayNames.set(deploymentId, edge.sourceDisplayName ?? null);
        } else if (deploymentDisplayNames.get(deploymentId) == null && edge.sourceDisplayName != null) {
            deploymentDisplayNames.set(deploymentId, edge.sourceDisplayName);
        }
    }

    // ── Step 2: DEPLOYS (PR → deployment) ───────────────────────────────────
    // prId = sourceId, deploymentId = targetId
    const prsByDeployment = new Map<string, Set<string>>();
    const prDisplayNames = new Map<string, string | null>();

    for (const edge of deploysEdges) {
        const prId = edge.sourceId;             // DEPLOYS source = PR
        const deploymentId = edge.targetId;     // DEPLOYS target = deployment
        if (!prsByDeployment.has(deploymentId)) {
            prsByDeployment.set(deploymentId, new Set());
        }
        prsByDeployment.get(deploymentId)!.add(prId);

        // PR display name from DEPLOYS sourceDisplayName
        if (edge.sourceDisplayName != null) {
            prDisplayNames.set(prId, edge.sourceDisplayName);
        } else if (!prDisplayNames.has(prId)) {
            prDisplayNames.set(prId, null);
        }
        // Deployment display name may also come from DEPLOYS targetDisplayName
        if (edge.targetDisplayName != null && !deploymentDisplayNames.has(deploymentId)) {
            deploymentDisplayNames.set(deploymentId, edge.targetDisplayName);
        }
    }

    // ── Step 3: Build incident-centric rows ─────────────────────────────────
    return Array.from(deploymentsByIncident.keys()).map((incidentId) => {
        const depIds = Array.from(deploymentsByIncident.get(incidentId) ?? []);
        // Collect all PRs that caused any of this incident's deployments
        const prIdSet = new Set<string>();
        for (const depId of depIds) {
            for (const prId of prsByDeployment.get(depId) ?? []) {
                prIdSet.add(prId);
            }
        }
        const prIds = Array.from(prIdSet);

        return {
            incidentId,
            incidentDisplayName: incidentDisplayNames.get(incidentId) ?? null,
            deploymentIds: depIds,
            prIds,
            deploymentDisplayNames: Object.fromEntries(
                depIds.map((id) => [id, deploymentDisplayNames.get(id) ?? null]),
            ),
            prDisplayNames: Object.fromEntries(
                prIds.map((id) => [id, prDisplayNames.get(id) ?? null]),
            ),
        };
    });
}

/**
 * Derive Sankey nodes/links from joined rows.
 * Returns null when there are no links to render.
 */
export function buildSankeyData(
    rows: IncidentRow[],
): { nodes: SankeyNode[]; links: SankeyLink[] } | null {
    const limited = rows.slice(0, MAX_SANKEY_INCIDENTS);
    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];

    // CHAOS-2118: key nodes by (type, id) — a composite to prevent two different
    // node types whose raw UUIDs happen to be equal from merging into one node.
    // Links also reference by nodeKey so display-name collisions are impossible.
    const seen = new Set<string>();

    const makeNodeKey = (group: string, rawId: string) => `${group}:${rawId}`;

    // nodeKey serves as SankeyNode.id — the ECharts adapter uses node.id when
    // present, so this key is what ECharts sees internally.
    const addNode = (rawId: string, name: string, group: string) => {
        const nodeKey = makeNodeKey(group, rawId);
        if (!seen.has(nodeKey)) {
            nodes.push({ id: nodeKey, name, group });
            seen.add(nodeKey);
        }
    };

    for (const row of limited) {
        // Incident label: prefer server-resolved display name; fall back to short ID prefix
        const incLabel =
            row.incidentDisplayName?.trim() || `inc:${row.incidentId.slice(0, 8)}`;
        addNode(row.incidentId, incLabel, "incident");
        const incKey = makeNodeKey("incident", row.incidentId);

        for (const depId of row.deploymentIds.slice(0, MAX_LINKS_PER_INCIDENT)) {
            // CHAOS-2119: use server-resolved deployment name when available
            const resolved = row.deploymentDisplayNames?.[depId];
            const depLabel = resolved?.trim() || `dep:${depId.slice(0, 8)}`;
            addNode(depId, depLabel, "deployment");
            const depKey = makeNodeKey("deployment", depId);
            // Flow: deployment → incident (link by composite key, never by label)
            links.push({ source: depKey, target: incKey, value: 1 });
        }

        for (const prId of row.prIds.slice(0, MAX_LINKS_PER_INCIDENT)) {
            // CHAOS-2119: use server-resolved PR name when available
            const resolved = row.prDisplayNames?.[prId];
            const prLabel = resolved?.trim() || `pr:${prId.slice(0, 8)}`;
            addNode(prId, prLabel, "pr");
            const prKey = makeNodeKey("pr", prId);
            // Flow: PR → deployment (but we link PR → incident's deployment)
            // Since each PR is linked to deployments, flow is pr → deployment.
            // The deployment node for this PR may come from different incidents;
            // we connect to the deployment that links to this incident.
            for (const depId of row.deploymentIds.slice(0, MAX_LINKS_PER_INCIDENT)) {
                // Only add PR→deployment link when this PR caused this deployment
                // (deploymentIds are the deployments for this incident row)
                const depKey = makeNodeKey("deployment", depId);
                links.push({ source: prKey, target: depKey, value: 1 });
            }
        }
    }

    return links.length > 0 ? { nodes, links } : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncidentCorrelationDashboard({
    orgId,
    deltas,
    drivers,
    contributors,
    explainUnit,
    deploysEdges,
    incidentEdges,
    filters,
    role,
}: IncidentCorrelationDashboardProps) {
    const incidentRows = useMemo(
        () => joinEdges(deploysEdges, incidentEdges),
        [deploysEdges, incidentEdges],
    );

    const sankeyData = useMemo(() => buildSankeyData(incidentRows), [incidentRows]);

    const doraMetrics = useMemo(
        () =>
            DORA_METRIC_KEYS.flatMap((key) => {
                const delta = deltas.find((d) => d.metric === key);
                return delta ? [delta] : [];
            }),
        [deltas],
    );

    const topDrivers = drivers.slice(0, 5);
    const hasDriverSeries = hasMeaningfulAssociations(topDrivers);
    // Render-safe association labels (A7): prefer the server-resolved display
    // name; degrade genuinely-unresolved ids to a stable short token + badge.
    const driverChartLabels = resolveEntityLabels(
        topDrivers.map((d) => d.id),
        (_id, i) => {
            const fallbackLabel = topDrivers[i]?.label?.trim();
            const labelName =
                fallbackLabel && !OPAQUE_LABEL_RE.test(fallbackLabel) ? fallbackLabel : undefined;
            return {
                name: topDrivers[i]?.display_name ?? labelName,
                unresolvedFallback: "Unresolved",
            };
        },
    );
    const topContributors = contributors.slice(0, 5);
    const hasExplainData = topDrivers.length > 0 || topContributors.length > 0;
    const hasEdgeData = incidentRows.length > 0;
    const hasAnyData = doraMetrics.length > 0 || hasExplainData || hasEdgeData;

    // ---------------------------------------------------------------------------
    // Empty state (mirrors CompoundingRiskDashboard voice)
    // ---------------------------------------------------------------------------
    if (!hasAnyData) {
        return (
            <div
                className="rounded-2xl border border-(--card-stroke) bg-card p-8 shadow-sm"
                data-testid="empty-state"
            >
                <h2 className="text-2xl font-semibold tracking-tight">
                    No incident-correlation evidence in this window.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                    Incident correlation requires deployment activity and linked incidents to be
                    ingested. Run <code className="font-mono text-[0.85em]">dev-hops sync git</code>{" "}
                    and ensure incidents are linked in your provider. The page will populate
                    automatically after the next data sync.
                </p>
                <p className="mt-8 text-xs text-(--ink-muted)">
                    Org <span className="font-mono">{orgId}</span>
                </p>
            </div>
        );
    }

    const cfrDelta = deltas.find((d) => d.metric === "change_failure_rate");

    return (
        <div className="flex flex-col gap-8" data-testid="incident-correlation-dashboard">
            {/* ── DORA KPI tiles ─────────────────────────────────────────────────── */}
            {doraMetrics.length > 0 && (
                <section aria-label="DORA metrics">
                    <h2 className="mb-4 font-(--font-display) text-xl">DORA Metrics</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {doraMetrics.map((m) => (
                            <MetricCard
                                key={m.metric}
                                label={m.label}
                                href={buildExploreUrl({ metric: m.metric, filters, role })}
                                value={m.value}
                                unit={m.unit}
                                delta={m.delta_pct}
                                spark={m.spark}
                                caption={m.label}
                            />
                        ))}
                    </div>
                </section>
            )}

            {cfrDelta &&
                (() => {
                    const cfrTrendData = cfrDelta.spark
                        .filter((point) => isFiniteNumber(point.value))
                        .map((point) => ({ day: point.ts, value: point.value }));
                    const hasCfrTrend = hasRenderableSeries(cfrTrendData);
                    return (
                        <section
                            className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
                            aria-label="Change failure rate trend"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="font-(--font-display) text-xl">
                                    Change Failure Rate — Trend
                                </h2>
                                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                    Recent trend
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                Deployment and incident trends appear when the connected source
                                provides enough history for the selected window.
                            </p>
                            {hasCfrTrend ? (
                                <div className="mt-4 h-64" data-testid="cfr-trend-chart">
                                    <TimeseriesChart
                                        data={cfrTrendData}
                                        height="100%"
                                        valueFormat="percent"
                                    />
                                </div>
                            ) : (
                                <DataState
                                    variant="insufficient-confidence"
                                    title="No trend data for this window"
                                    description="Change failure rate needs at least two finite points before a trend can be drawn."
                                    className="mt-4"
                                    data-testid="cfr-trend-empty"
                                />
                            )}
                        </section>
                    );
                })()}

            {/* ── Drivers + Contributors ──────────────────────────────────────────── */}
            {hasExplainData && (
                <section
                    className="grid gap-6 lg:grid-cols-2"
                    aria-label="Change failure root cause"
                >
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-(--font-display) text-xl">
                                Change Failure Associations
                            </h2>
                            <Link
                                href={buildExploreUrl({
                                    metric: "change_failure_rate",
                                    filters,
                                    role,
                                })}
                                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                            >
                                {CTA_LABELS.openEvidence}
                            </Link>
                        </div>
                        {hasDriverSeries ? (
                            <div className="mt-4 space-y-4">
                                <HorizontalBarChart
                                    categories={driverChartLabels.labels}
                                    values={topDrivers.map((d) => Math.abs(d.delta_pct))}
                                    categoryTitles={driverChartLabels.titles}
                                    valueFormat="percent"
                                />
                            </div>
                        ) : (
                            <DataState
                                variant="detector-enabled-no-findings"
                                title="No association data for this window"
                                description="Change failure associations need non-zero driver evidence before this chart can be drawn."
                                className="mt-4"
                                data-testid="change-failure-associations-empty"
                            />
                        )}
                    </div>

                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-(--font-display) text-xl">Contributors</h2>
                            <Link
                                href={buildExploreUrl({
                                    metric: "change_failure_rate",
                                    filters,
                                    role,
                                })}
                                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                            >
                                {CTA_LABELS.openEvidence}
                            </Link>
                        </div>
                        {topContributors.length > 0 ? (
                            <div className="mt-4 space-y-2 text-sm">
                                {topContributors.map((c) => (
                                    <div
                                        key={c.id}
                                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                                    >
                                        <EntityLabel id={c.id} displayName={c.display_name} />
                                        <span className="text-xs text-(--ink-muted)">
                                            {explainUnit
                                                ? formatMetricValue(c.value, explainUnit)
                                                : formatDelta(c.delta_pct)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-(--ink-muted)">
                                Contributor detail will appear once data is ingested.
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* ── PR ↔ Deployment ↔ Incident table ────────────────────────────────── */}
            {hasEdgeData && (
                <section aria-label="Linked incidents">
                    <div className="mb-4 flex items-baseline justify-between">
                        <h2 className="text-lg font-semibold tracking-tight">Linked Incidents</h2>
                        <p className="text-xs text-(--ink-muted)">
                            {incidentRows.length} incident
                            {incidentRows.length !== 1 ? "s" : ""} · showing the strongest linked
                            records
                        </p>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
                        <table className="w-full text-sm" data-testid="incident-linkage-table">
                            <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                                <tr>
                                    <th className="px-5 py-3 text-left">Incident ID</th>
                                    <th className="px-5 py-3 text-right">Linked Deployments</th>
                                    <th className="px-5 py-3 text-right">Linked PRs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incidentRows.slice(0, 50).map((row) => (
                                    <tr
                                        key={row.incidentId}
                                        className="border-t border-(--card-stroke)/60 hover:bg-(--card-60)/60"
                                        data-testid="incident-row"
                                        data-incident-id={row.incidentId}
                                    >
                                        <td className="px-5 py-3 text-xs">
                                            <EntityLabel
                                                id={row.incidentId}
                                                displayName={row.incidentDisplayName}
                                                className="font-mono"
                                            />
                                        </td>
                                        <td className="px-5 py-3 text-right tabular-nums">
                                            {row.deploymentIds.length}
                                        </td>
                                        <td className="px-5 py-3 text-right tabular-nums">
                                            {row.prIds.length}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* ── Sankey: PR → deployment → incident ──────────────────────────────── */}
            {sankeyData && (
                <section
                    className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
                    aria-label="Correlation flow diagram"
                >
                    <h2 className="font-(--font-display) text-xl">
                        PR → Deployment → Incident Flow
                    </h2>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        Top {MAX_SANKEY_INCIDENTS} incidents by linkage. Labels are shortened so the
                        flow remains readable.
                    </p>
                    <div className="mt-4">
                        <SankeyChart
                            nodes={sankeyData.nodes}
                            links={sankeyData.links}
                            height={360}
                        />
                    </div>
                </section>
            )}

            {/* ── Sub-empty: metrics/explain present but no edges ─────────────────── */}
            {!hasEdgeData && (doraMetrics.length > 0 || hasExplainData) && (
                <section
                    className="rounded-2xl border border-(--card-stroke) bg-(--card-60) p-6 text-sm text-(--ink-muted)"
                    data-testid="empty-edges-state"
                >
                    No deployment-incident linkage found yet. Deployment and incident associations
                    appear here after your connected provider sends enough linked evidence for the
                    selected window.
                </section>
            )}
        </div>
    );
}
