/**
 * IncidentCorrelationDashboard — client surface for /incident-correlation (CHAOS-1746).
 *
 * Renders:
 *   1. DORA KPI tiles — only for metrics actually present in home.deltas (no zero placeholders).
 *   2. Enlarged change_failure_rate sparkline (V1 trend — no multi-week chart, see CHAOS-1757).
 *   3. Drivers + Contributors (HorizontalBarChart from getExplainData).
 *   4. Linked incidents table — client-side join of DEPLOYS + LINKED_INCIDENT edges.
 *   5. SankeyChart — top N deployments → incidents → work items (skipped when join is empty).
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
import { MetricCard } from "@/components/metrics/MetricCard";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import type {
	Contributor,
	MetricDelta,
	SankeyLink,
	SankeyNode,
} from "@/lib/types";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** WorkGraph edge — mirrors WORK_GRAPH_EDGES_QUERY field set exactly. */
export type WorkGraphEdge = {
	edgeId: string;
	sourceType: string;
	sourceId: string;
	targetType: string;
	targetId: string;
	edgeType: string;
	provenance: string | null;
	confidence: number | null;
	evidence: string | null;
	repoId: string | null;
	provider: string | null;
};

/** Joined incident row: one incident with its linked deployments and work items. */
export type IncidentRow = {
	incidentId: string;
	deploymentIds: string[];
	workItemIds: string[];
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
const DORA_METRIC_KEYS = [
	"change_failure_rate",
	"deployment_frequency",
	"mttr",
] as const;

const MAX_SANKEY_INCIDENTS = 10;
const MAX_LINKS_PER_INCIDENT = 3;

// ---------------------------------------------------------------------------
// Pure join / transform helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Join DEPLOYS and LINKED_INCIDENT edge sets by incident ID.
 *
 * Convention (consistent with dev-health-ops backend):
 *   DEPLOYS:          sourceId = deployment,  targetId = incident
 *   LINKED_INCIDENT:  sourceId = incident,    targetId = work_item
 *
 * V1 limitation: no time-windowed filtering — schema doesn't support it.
 */
export function joinEdges(
	deploysEdges: WorkGraphEdge[],
	incidentEdges: WorkGraphEdge[],
): IncidentRow[] {
	const deploysByIncident = new Map<string, Set<string>>();
	for (const edge of deploysEdges) {
		const incidentId = edge.targetId;
		const deploymentId = edge.sourceId;
		if (!deploysByIncident.has(incidentId)) {
			deploysByIncident.set(incidentId, new Set());
		}
		deploysByIncident.get(incidentId)!.add(deploymentId);
	}

	const workItemsByIncident = new Map<string, Set<string>>();
	for (const edge of incidentEdges) {
		const incidentId = edge.sourceId;
		const workItemId = edge.targetId;
		if (!workItemsByIncident.has(incidentId)) {
			workItemsByIncident.set(incidentId, new Set());
		}
		workItemsByIncident.get(incidentId)!.add(workItemId);
	}

	const allIncidentIds = new Set([
		...deploysByIncident.keys(),
		...workItemsByIncident.keys(),
	]);

	return Array.from(allIncidentIds).map((incidentId) => ({
		incidentId,
		deploymentIds: Array.from(deploysByIncident.get(incidentId) ?? []),
		workItemIds: Array.from(workItemsByIncident.get(incidentId) ?? []),
	}));
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
	const seen = new Set<string>();

	const addNode = (name: string, group: string) => {
		if (!seen.has(name)) {
			nodes.push({ name, group });
			seen.add(name);
		}
	};

	for (const row of limited) {
		const incName = `inc:${row.incidentId.slice(0, 8)}`;
		addNode(incName, "incident");

		for (const depId of row.deploymentIds.slice(0, MAX_LINKS_PER_INCIDENT)) {
			const depName = `dep:${depId.slice(0, 8)}`;
			addNode(depName, "deployment");
			links.push({ source: depName, target: incName, value: 1 });
		}

		for (const wiId of row.workItemIds.slice(0, MAX_LINKS_PER_INCIDENT)) {
			const wiName = `wi:${wiId.slice(0, 8)}`;
			addNode(wiName, "work_item");
			links.push({ source: incName, target: wiName, value: 1 });
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

	const sankeyData = useMemo(
		() => buildSankeyData(incidentRows),
		[incidentRows],
	);

	const doraMetrics = useMemo(
		() =>
			DORA_METRIC_KEYS.flatMap((key) => {
				const delta = deltas.find((d) => d.metric === key);
				return delta ? [delta] : [];
			}),
		[deltas],
	);

	const topDrivers = drivers.slice(0, 5);
	// Render-safe association labels (A7): prefer the server-resolved display
	// name; degrade genuinely-unresolved ids to a stable short token + badge.
	const driverChartLabels = resolveEntityLabels(
		topDrivers.map((d) => d.id),
		(_id, i) => ({
			name: topDrivers[i]?.display_name ?? undefined,
			unresolvedFallback: "Unresolved",
		}),
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
					Incident correlation requires deployment activity and linked incidents
					to be ingested. Run{" "}
					<code className="font-mono text-[0.85em]">dev-hops sync git</code> and
					ensure incidents are linked in your provider. The page will populate
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
		<div
			className="flex flex-col gap-8"
			data-testid="incident-correlation-dashboard"
		>
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

			{cfrDelta && cfrDelta.spark.length > 0 && (
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
					<div
						role="img"
						aria-label="CFR sparkline"
						className="mt-4 flex h-24 items-end gap-0.5"
						data-testid="cfr-sparkline"
					>
						{(() => {
							const maxVal = Math.max(
								0.01,
								...cfrDelta.spark.map((p) => p.value),
							);
							return cfrDelta.spark.map((point) => {
								const height = Math.max(4, (point.value / maxVal) * 88);
								return (
									<div
										key={point.ts}
										className="flex-1 rounded-t-sm bg-(--accent)"
										style={{ height: `${height}px` }}
										title={`${point.ts}: ${point.value}`}
									/>
								);
							});
						})()}
					</div>
				</section>
			)}

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
						{topDrivers.length > 0 ? (
							<div className="mt-4 space-y-4">
								<HorizontalBarChart
									categories={driverChartLabels.labels}
									values={topDrivers.map((d) => Math.abs(d.delta_pct))}
									categoryTitles={driverChartLabels.titles}
								/>
							</div>
						) : (
							<p className="mt-4 text-sm text-(--ink-muted)">
								Association detail will appear once data is ingested.
							</p>
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

			{/* ── Deployment ↔ Incident ↔ Work-item table ────────────────────────── */}
			{hasEdgeData && (
				<section aria-label="Linked incidents">
					<div className="mb-4 flex items-baseline justify-between">
						<h2 className="text-lg font-semibold tracking-tight">
							Linked Incidents
						</h2>
						<p className="text-xs text-(--ink-muted)">
							{incidentRows.length} incident
							{incidentRows.length !== 1 ? "s" : ""} · showing the strongest
							linked records
						</p>
					</div>
					<div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
						<table
							className="w-full text-sm"
							data-testid="incident-linkage-table"
						>
							<thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
								<tr>
									<th className="px-5 py-3 text-left">Incident ID</th>
									<th className="px-5 py-3 text-right">Linked Deployments</th>
									<th className="px-5 py-3 text-right">Linked Work Items</th>
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
											<EntityLabel id={row.incidentId} className="font-mono" />
										</td>
										<td className="px-5 py-3 text-right tabular-nums">
											{row.deploymentIds.length}
										</td>
										<td className="px-5 py-3 text-right tabular-nums">
											{row.workItemIds.length}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{/* ── Sankey: deployment → incident → work-item ───────────────────────── */}
			{sankeyData && (
				<section
					className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
					aria-label="Correlation flow diagram"
				>
					<h2 className="font-(--font-display) text-xl">
						Deployment → Incident → Work Item Flow
					</h2>
					<p className="mt-1 text-xs text-(--ink-muted)">
						Top {MAX_SANKEY_INCIDENTS} incidents by linkage. Labels are
						shortened so the flow remains readable.
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
					No deployment-incident linkage found yet. Deployment and incident
					associations appear here after your connected provider sends enough
					linked evidence for the selected window.
				</section>
			)}
		</div>
	);
}
