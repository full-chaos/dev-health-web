"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appPath } from "@/lib/navigation/appPath";

import { ClientTimestamp } from "@/components/ClientTimestamp";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import {
    EvidenceFact,
    EvidenceFactList,
    EvidenceProvenanceFacts,
} from "@/components/evidence/EvidenceFacts";
import { StatusPill } from "@/components/admin/StatusPill";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { getHeatmap } from "@/lib/api/visuals";
import { resolveEntityLabel } from "@/lib/labels/entityLabel";
import { RepoScopeNote } from "@/components/shared/RepoScopeNote";
import { filterEmptyReasonText } from "@/lib/metrics/filterEmptyReason";
import { showChartRepoNote } from "@/lib/metrics/repoScope";
import type { HeatmapCell, HeatmapResponse, MetricFilter } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";

import { HeatmapChart } from "./HeatmapChart";

type HeatmapRequest = {
    type: "temporal_load" | "context_switch" | "risk" | "individual";
    metric: string;
    scope_type: string;
    scope_id?: string;
    range_days: number;
    start_date?: string;
    end_date?: string;
};

type HeatmapPanelProps = {
    title: string;
    description: string;
    request: HeatmapRequest;
    initialData?: HeatmapResponse | null;
    emptyState?: string;
    evidenceTitle?: string;
    /** Plain-language summary shown before any cell is selected (top hotspots + why). */
    defaultSummary?: string;
    /** Message shown when every cell carries the same value (no variance to map). */
    flatStateLabel?: string;
    /** Sits inside a Section card that already carries the title and description: no own card, no heading. */
    embedded?: boolean;
    /** The read failed: show the shared error card instead of the empty box. */
    failed?: boolean;
    /** The page filter: a repository in `what.repos` gets the "Not filtered by repository" note. */
    filters?: MetricFilter;
};

const asText = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length ? value.trim() : null;

const asNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

const pickTimestamp = (item: Record<string, unknown>): string | null =>
    asText(item.ts) ??
    asText(item.timestamp) ??
    asText(item.created_at) ??
    asText(item.merged_at) ??
    asText(item.completed_at) ??
    asText(item.occurred_at) ??
    null;

const evidenceLink = (item: Record<string, unknown>): string | null => {
    const repoId = asText(item.repo_id);
    const number = asNumber(item.number);
    const workItemId = asText(item.work_item_id);

    if (repoId && number !== null) {
        return appPath("/prs/[pr_id]", { pr_id: `${repoId}:${number}` });
    }
    if (workItemId) {
        return appPath("/issues/[issue_id]", { issue_id: workItemId });
    }
    return null;
};

type ResolvedArtifact = {
    type: string;
    label: string;
    title: string;
    timestamp: string | null;
    value: number | null;
    link: string | null;
    /** The served repository name of a PR row; null = not served. Never the repository id. */
    repoName?: string | null;
};

/**
 * Describe a single evidence row as a human-readable artifact: a typed kind,
 * a render-safe label (via the shared entity-label helper — never a bare
 * UUID/path), a tooltip carrying the full identifier, and a timestamp.
 * Replaces the previous raw `JSON.stringify(item)` dump.
 */
/**
 * Resolve an entity id to a render-safe { label, title }. A degraded UUID/hash
 * id with no served name shows the plain type word (or "Unresolved"); the id is not shown.
 */
function entityArtifactLabel(
    id: string | null | undefined,
    options: { name?: string | null; fallback?: string; kind?: string } = {},
): { label: string; title: string } {
    const { label, resolved } = resolveEntityLabel(id, {
        name: options.name ?? undefined,
        fallback: options.fallback,
        unresolvedFallback: "Unresolved",
    });
    // An id with no served name is never drawn as a label: the plain type word shows.
    const shown = resolved || !id || !options.kind ? label : options.kind;
    return { label: shown, title: shown };
}

/** What a linked artifact row opens: its detail page, named by the kind of the row. */
const openLabel = (type: string): string =>
    type === "PR" ? "Open pull request" : type === "Work item" ? "Open work item" : "Open details";

export function describeArtifact(item: Record<string, unknown>, index: number): ResolvedArtifact {
    const explicitName =
        asText(item.title) ?? asText(item.name) ?? asText(item.repo_name) ?? asText(item.author);
    const timestamp = pickTimestamp(item);
    const value = asNumber(item.value);
    const link = evidenceLink(item);

    const path = asText(item.path) ?? asText(item.file_key);
    const commit = asText(item.commit_hash);
    const number = asNumber(item.number);
    const workItem = asText(item.work_item_id);
    const deployment = asText(item.deployment_id);

    if (path) {
        const { label, title } = entityArtifactLabel(path, { name: explicitName, kind: "File" });
        return { type: "File", label, title, timestamp, value, link };
    }
    if (commit) {
        return {
            type: "Commit",
            label: explicitName ?? "Commit",
            title: explicitName ?? "Commit",
            timestamp,
            value,
            link,
        };
    }
    if (number !== null) {
        // The served PR title names the row; a repository id is never drawn as a name.
        const prTitle = asText(item.title);
        return {
            type: "PR",
            label: prTitle ? `${prTitle} #${number}` : `Pull request #${number}`,
            title: `#${number}`,
            timestamp,
            value,
            link,
            repoName: asText(item.repo_name),
        };
    }
    if (workItem) {
        const { label, title } = entityArtifactLabel(workItem, {
            name: explicitName,
            kind: "Work item",
        });
        return { type: "Work item", label, title, timestamp, value, link };
    }
    if (deployment) {
        const { label, title } = entityArtifactLabel(deployment, {
            name: explicitName,
            kind: "Deployment",
        });
        return { type: "Deployment", label, title, timestamp, value, link };
    }

    const { label, title } = entityArtifactLabel(explicitName, {
        fallback: `Item ${index + 1}`,
    });
    return { type: "Item", label, title, timestamp, value, link };
}

export function HeatmapPanel({
    title,
    description,
    request,
    initialData,
    emptyState = "Heatmap data unavailable.",
    evidenceTitle = "Evidence",
    defaultSummary,
    flatStateLabel = "No variance in this window — every cell shares the same value.",
    embedded = false,
    failed = false,
    filters,
}: HeatmapPanelProps) {
    const evidenceDrawer = useEvidenceDrawer();
    // The artifacts shown under the chart before any selection (served with the grid).
    const evidence = useMemo(() => initialData?.evidence ?? [], [initialData]);

    const data = initialData;
    const unit = data?.legend?.unit;
    // The team grid and the person grid are both hours by weekdays: one rule for both, the
    // prototype's axes and captions.
    const isWeekHours = request.type === "temporal_load" || request.type === "individual";

    // A cell is a mark on the chart canvas, not a focusable element: when the drawer closes, focus
    // goes back to the chart region.
    const chartRegionRef = useRef<HTMLDivElement>(null);
    // A cell opens the shared evidence drawer; the drawer body loads the cell's artifacts.
    const handleCellSelect = useCallback(
        (cell: HeatmapCell) => {
            evidenceDrawer.open({
                title: `${cell.y} · ${cell.x}`,
                content: (
                    <HeatmapCellEvidence
                        request={request}
                        cell={cell}
                        unit={unit}
                        filters={filters}
                    />
                ),
                returnFocusRef: chartRegionRef,
            });
        },
        [evidenceDrawer, request, unit, filters],
    );

    // A heatmap with no spread across its cells renders as a single flat colour,
    // which reads as "broken" rather than "uniform". Detect it and say so.
    const isFlat = useMemo(() => {
        const values = data?.cells?.map((cell) => cell.value) ?? [];
        if (values.length < 2) {
            return false;
        }
        return Math.max(...values) - Math.min(...values) === 0;
    }, [data]);

    const artifacts = useMemo(
        () => evidence.map((item, index) => describeArtifact(item, index)),
        [evidence],
    );

    if (failed && !data) {
        return <ErrorCard title="Could not be read" compact headingLevel={3} />;
    }

    // A known served reason is the empty state whatever axes or legend the answer holds: the
    // answer for a repository the team does not hold has both, and no cells (CHAOS-9210).
    const emptyReasonText = filterEmptyReasonText(data?.filter_empty_reason);
    if (
        emptyReasonText ||
        !data ||
        !data.legend ||
        !data.axes?.x?.length ||
        !data.axes?.y?.length
    ) {
        return (
            <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
                {emptyReasonText ?? emptyState}
            </div>
        );
    }

    const headerNote = defaultSummary ? "Top hotspots" : null;
    const showArtifacts = artifacts.length > 0;

    const repoNote = <RepoScopeNote show={showChartRepoNote(filters, data)} />;

    return (
        <div className={embedded ? "" : "rounded-3xl border border-(--card-stroke) bg-card p-5"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                {embedded ? null : (
                    <div>
                        <h2 className="font-(--font-display) text-xl">{title}</h2>
                        <p className="mt-2 text-sm text-(--ink-muted)">{description}</p>
                        {repoNote}
                    </div>
                )}
                {/* Prototype `pill(unit, 'info')` (app.js:79): the served unit as an info pill. */}
                {data.legend.unit && !embedded ? (
                    <StatusPill tone="info" testId="heatmap-unit">
                        {data.legend.unit}
                    </StatusPill>
                ) : null}
            </div>
            {embedded ? repoNote : null}
            <div
                ref={chartRegionRef}
                tabIndex={-1}
                role="group"
                aria-label={`${title} chart`}
                data-testid="heatmap-chart-region"
                className="mt-4"
            >
                {isFlat ? (
                    <div
                        data-testid="heatmap-flat-state"
                        className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-6 text-center text-sm text-(--ink-muted)"
                    >
                        {flatStateLabel}
                    </div>
                ) : (
                    <HeatmapChart
                        data={data}
                        height={320}
                        onCellSelectAction={handleCellSelect}
                        weekHours={isWeekHours}
                    />
                )}
                {isWeekHours && !isFlat ? (
                    <div
                        data-testid="heatmap-axis-captions"
                        className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-(--ink-muted)"
                    >
                        <span>Hour of day · day of week</span>
                        <span>
                            {title} · {request.scope_type} scope
                        </span>
                    </div>
                ) : null}
            </div>
            <div className="mt-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                        data-testid="heatmap-evidence-title"
                        className="text-xs font-medium text-(--ink-muted)"
                    >
                        {evidenceTitle}
                    </p>
                    {headerNote ? (
                        <span className="text-xs text-(--ink-muted)">{headerNote}</span>
                    ) : null}
                </div>

                {defaultSummary ? (
                    <p className="mt-3 text-sm leading-6 text-(--ink-muted)">{defaultSummary}</p>
                ) : null}

                {showArtifacts ? <HeatmapArtifactList artifacts={artifacts} /> : null}

                {artifacts.length === 0 ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        {defaultSummary
                            ? "Hotspot artifacts appear here once code history is connected for this view."
                            : "Select a cell to inspect the underlying evidence."}
                    </p>
                ) : null}

                {showArtifacts && !isFlat ? (
                    <p className="mt-3 text-xs text-(--ink-muted)">
                        Select a cell to inspect its underlying artifacts.
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/** The artifact rows of a heatmap: under the chart (first list) and in the drawer (one cell). */
function HeatmapArtifactList({ artifacts }: { artifacts: ResolvedArtifact[] }) {
    return (
        <div className="mt-3 space-y-2 text-sm">
            {artifacts.map((artifact) => {
                const body = (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded border border-(--card-stroke) bg-(--card-70) px-1.5 py-0.5 text-label-caps font-bold uppercase text-(--ink-muted)">
                                    {artifact.type}
                                </span>
                                <span className="truncate" title={artifact.title}>
                                    {artifact.label}
                                </span>
                            </div>
                            {artifact.value !== null ? (
                                <span className="shrink-0 text-xs text-(--ink-muted)">
                                    {formatNumber(artifact.value)}
                                </span>
                            ) : artifact.link ? (
                                <span className="shrink-0 text-xs text-(--ink-muted)">
                                    {openLabel(artifact.type)}
                                </span>
                            ) : null}
                        </div>
                        {artifact.type === "PR" && artifact.repoName ? (
                            <span className="mt-1 block truncate text-xs text-(--ink-muted)">
                                {artifact.repoName}
                            </span>
                        ) : null}
                        {artifact.timestamp ? (
                            <ClientTimestamp
                                value={artifact.timestamp}
                                className="mt-1 block text-xs text-(--ink-muted)"
                            />
                        ) : null}
                    </>
                );
                const artifactKey =
                    artifact.link ?? `${artifact.title}-${artifact.timestamp ?? artifact.label}`;
                return artifact.link ? (
                    <Link
                        key={artifactKey}
                        href={artifact.link}
                        prefetch={false}
                        className="block rounded-2xl border border-(--card-stroke) bg-card px-3 py-2 transition-colors hover:border-(--accent)/40"
                    >
                        {body}
                    </Link>
                ) : (
                    <div
                        key={artifactKey}
                        className="rounded-2xl border border-(--card-stroke) bg-card px-3 py-2"
                    >
                        {body}
                    </div>
                );
            })}
        </div>
    );
}

type CellEvidenceState =
    | { status: "loading" }
    | { status: "failed" }
    | { status: "loaded"; evidence: Array<Record<string, unknown>> };

/**
 * The drawer body for one heatmap cell: the cell's served value, then its artifacts, loaded with
 * the same request as the grid (plus the cell). A failed request shows an error, not "no
 * artifacts": the two states are different.
 */
function HeatmapCellEvidence({
    request,
    cell,
    unit,
    filters,
}: {
    request: HeatmapRequest;
    cell: HeatmapCell;
    unit?: string;
    filters?: MetricFilter;
}) {
    const [state, setState] = useState<CellEvidenceState>({ status: "loading" });

    useEffect(() => {
        let live = true;
        getHeatmap({ ...request, x: cell.x, y: cell.y, limit: 50, filters })
            .then((response) => {
                if (live) setState({ status: "loaded", evidence: response.evidence ?? [] });
            })
            .catch(() => {
                if (live) setState({ status: "failed" });
            });
        return () => {
            live = false;
        };
    }, [request, cell, filters]);

    const artifacts = useMemo(
        () =>
            state.status === "loaded"
                ? state.evidence.map((item, index) => describeArtifact(item, index))
                : [],
        [state],
    );

    // The served provider of the cell's rows: distinct `source` values, sorted, joined. None served = no value.
    const source = useMemo(() => {
        if (state.status !== "loaded") return undefined;
        const names = new Set(
            state.evidence.map((item) => asText(item.source)).filter((name) => name !== null),
        );
        return names.size > 0 ? [...names].sort().join(", ") : undefined;
    }, [state]);

    return (
        <div data-testid="heatmap-cell-evidence" className="space-y-4">
            {/* The heatmap query serves only the artifact list for a cell: the Artifacts row shows once
                it is loaded, and nothing shows while the request runs or after it failed. */}
            {state.status === "loading" ? null : (
                <EvidenceProvenanceFacts
                    source={source}
                    artifactCount={state.status === "loaded" ? artifacts.length : undefined}
                />
            )}
            <EvidenceFactList aria-label="Cell" testId="evidence-subject-facts">
                <EvidenceFact
                    label="Value"
                    // The same precision as the chart tooltip, so the drawer and the cell agree.
                    value={`${formatNumber(cell.value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`}
                />
            </EvidenceFactList>

            {state.status === "loading" ? (
                <p className="text-sm text-(--ink-muted)">Loading evidence...</p>
            ) : null}

            {state.status === "failed" ? (
                <ErrorCard
                    title="Unable to load this view"
                    message="We couldn't load the artifacts for this cell. This is usually temporary — try again in a moment."
                />
            ) : null}

            {state.status === "loaded" && artifacts.length > 0 ? (
                <HeatmapArtifactList artifacts={artifacts} />
            ) : null}

            {state.status === "loaded" && artifacts.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">
                    No artifacts linked to this cell in the selected window.
                </p>
            ) : null}
        </div>
    );
}
