"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ClientTimestamp } from "@/components/ClientTimestamp";
import { getHeatmap } from "@/lib/api/visuals";
import { resolveEntityLabel } from "@/lib/labels/entityLabel";
import type { HeatmapCell, HeatmapResponse } from "@/lib/types";
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
        return `/prs/${repoId}:${number}`;
    }
    if (workItemId) {
        return `/issues/${workItemId}`;
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
};

/**
 * Describe a single evidence row as a human-readable artifact: a typed kind,
 * a render-safe label (via the shared entity-label helper — never a bare
 * UUID/path), a tooltip carrying the full identifier, and a timestamp.
 * Replaces the previous raw `JSON.stringify(item)` dump.
 */
/**
 * Resolve an entity id to a render-safe { label, title }. A degraded UUID/hash
 * id falls back to a stable short token (e.g. "#a1b2c3d4") — opting into the
 * `unresolvedFallback` contract so the dev-only unresolved-id assertion does not
 * throw during render (which crashed the heatmap evidence list on cell click).
 */
function entityArtifactLabel(
    id: string | null | undefined,
    options: { name?: string | null; fallback?: string } = {},
): { label: string; title: string } {
    const { label, title, short } = resolveEntityLabel(id, {
        name: options.name ?? undefined,
        fallback: options.fallback,
        unresolvedFallback: "Unresolved",
    });
    return { label: short ?? label, title };
}

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
        const { label, title } = entityArtifactLabel(path, { name: explicitName });
        return { type: "File", label, title, timestamp, value, link };
    }
    if (commit) {
        return {
            type: "Commit",
            label: explicitName ?? commit.slice(0, 8),
            title: commit,
            timestamp,
            value,
            link,
        };
    }
    if (number !== null) {
        const repo = asText(item.repo_id);
        const repoLabel = repo
            ? entityArtifactLabel(repo, { name: asText(item.repo_name) }).label
            : null;
        return {
            type: "PR",
            label: repoLabel ? `${repoLabel} #${number}` : `#${number}`,
            title: repo ? `${repo}#${number}` : `#${number}`,
            timestamp,
            value,
            link,
        };
    }
    if (workItem) {
        const { label, title } = entityArtifactLabel(workItem, {
            name: explicitName,
        });
        return { type: "Work item", label, title, timestamp, value, link };
    }
    if (deployment) {
        const { label, title } = entityArtifactLabel(deployment, {
            name: explicitName,
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
}: HeatmapPanelProps) {
    const [selected, setSelected] = useState<HeatmapCell | null>(null);
    const [evidence, setEvidence] = useState<Array<Record<string, unknown>>>(
        initialData?.evidence ?? [],
    );
    const [loading, setLoading] = useState(false);

    const data = initialData;

    const handleCellSelect = useCallback(
        async (cell: HeatmapCell) => {
            setSelected(cell);
            setLoading(true);
            try {
                const response = await getHeatmap({
                    ...request,
                    x: cell.x,
                    y: cell.y,
                    limit: 50,
                });
                setEvidence(response.evidence ?? []);
            } catch {
                setEvidence([]);
            } finally {
                setLoading(false);
            }
        },
        [request],
    );

    const selectionLabel = useMemo(() => {
        if (!selected) {
            return null;
        }
        return `${selected.y} · ${selected.x}`;
    }, [selected]);

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

    if (!data || !data.axes?.x?.length || !data.axes?.y?.length) {
        return (
            <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
                {emptyState}
            </div>
        );
    }

    const headerNote = selectionLabel ?? (defaultSummary ? "Top hotspots" : null);
    const showArtifacts = !loading && artifacts.length > 0;

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-(--font-display) text-xl">{title}</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">{description}</p>
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                    {data.legend.unit}
                </div>
            </div>
            <div className="mt-4">
                {isFlat ? (
                    <div
                        data-testid="heatmap-flat-state"
                        className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-6 text-center text-sm text-(--ink-muted)"
                    >
                        {flatStateLabel}
                    </div>
                ) : (
                    <HeatmapChart data={data} height={320} onCellSelectAction={handleCellSelect} />
                )}
            </div>
            <div className="mt-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        {evidenceTitle}
                    </p>
                    {headerNote ? (
                        <span className="text-xs text-(--ink-muted)">{headerNote}</span>
                    ) : null}
                </div>

                {!selected && defaultSummary ? (
                    <p className="mt-3 text-sm leading-6 text-(--ink-muted)">{defaultSummary}</p>
                ) : null}

                {loading ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">Loading evidence...</p>
                ) : null}

                {showArtifacts ? (
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
                                                Open flame
                                            </span>
                                        ) : null}
                                    </div>
                                    {artifact.timestamp ? (
                                        <ClientTimestamp
                                            value={artifact.timestamp}
                                            className="mt-1 block text-xs text-(--ink-muted)"
                                        />
                                    ) : null}
                                </>
                            );
                            const artifactKey =
                                artifact.link ??
                                `${artifact.title}-${artifact.timestamp ?? artifact.label}`;
                            return artifact.link ? (
                                <Link
                                    key={artifactKey}
                                    href={artifact.link}
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
                ) : null}

                {!loading && selected && artifacts.length === 0 ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        No artifacts linked to this cell in the selected window.
                    </p>
                ) : null}

                {!loading && !selected && artifacts.length === 0 ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        {defaultSummary
                            ? "Hotspot artifacts appear here once code history is connected for this view."
                            : "Select a cell to inspect the underlying evidence."}
                    </p>
                ) : null}

                {showArtifacts && !selected && !isFlat ? (
                    <p className="mt-3 text-xs text-(--ink-muted)">
                        Select a cell to inspect its underlying artifacts.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
