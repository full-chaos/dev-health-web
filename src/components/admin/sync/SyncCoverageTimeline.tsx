"use client";

import { useMemo, useState } from "react";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateUTC } from "@/lib/formatters";
import type {
    SyncCoverageDataset,
    SyncCoverageRange,
    SyncCoverageSummary,
} from "@/lib/admin/types";
import { CoverageBadge, statusLabel, statusTone, type CoverageTone } from "./CoverageBadge";

interface SyncCoverageTimelineProps {
    coverage: SyncCoverageSummary | null;
    error?: string | null;
    /** Opens the backfill wizard prefilled with this gap's range (CHAOS-2795/2796). */
    onBackfillGapAction: (range: SyncCoverageRange) => void;
}

type BandKind = "covered" | "gap" | "stale" | "failed";

const BAND_TONE: Record<BandKind, CoverageTone> = {
    covered: "positive",
    gap: "negative",
    stale: "caution",
    failed: "negative",
};

const BAND_LABEL: Record<BandKind, string> = {
    covered: "Covered",
    gap: "Gap",
    stale: "Stale",
    failed: "Failed",
};

const BAND_BAR_CLASS: Record<BandKind, string> = {
    covered: "bg-(--positive)",
    gap: "border border-dashed border-(--negative) bg-(--negative)/40",
    stale: "bg-(--caution)",
    failed: "bg-(--negative)",
};

interface TimelineRow {
    kind: BandKind;
    range: SyncCoverageRange;
    datasetKey: string;
}

/** Content-derived row/band key — stable across re-renders, unlike array index. */
function rangeKey(kind: BandKind, range: SyncCoverageRange): string {
    return `${kind}-${range.since}-${range.before}-${range.source_ids.join(",")}`;
}

function rangeIncludesSource(range: SyncCoverageRange, sourceId: string | null): boolean {
    if (!sourceId) return true;
    return range.source_ids.includes(sourceId);
}

/** Compute the [start, end] extent (ms epoch) spanning every range in a dataset. */
function datasetExtent(dataset: SyncCoverageDataset): [number, number] | null {
    const allRanges = [
        ...dataset.requested_ranges,
        ...dataset.covered_ranges,
        ...dataset.gaps,
        ...dataset.stale_ranges,
        ...dataset.failed_ranges,
    ];
    if (allRanges.length === 0) return null;
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const r of allRanges) {
        const since = new Date(r.since).getTime();
        const before = new Date(r.before).getTime();
        if (!Number.isNaN(since)) start = Math.min(start, since);
        if (!Number.isNaN(before)) end = Math.max(end, before);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return [start, end];
}

function bandStyle(
    range: SyncCoverageRange,
    extent: [number, number],
): { left: string; width: string } {
    const [start, end] = extent;
    const span = end - start;
    const since = new Date(range.since).getTime();
    const before = new Date(range.before).getTime();
    const left = span > 0 ? Math.max(0, Math.min(100, ((since - start) / span) * 100)) : 0;
    const rawWidth = span > 0 ? ((before - since) / span) * 100 : 100;
    const width = Math.max(1, Math.min(100 - left, rawWidth));
    return { left: `${left}%`, width: `${width}%` };
}

/**
 * Coverage & gaps timeline (CHAOS-2793). Renders ONLY persisted dataset/source
 * coverage ranges from the API — no client-side interval recomputation. CSS
 * horizontal bands are a decorative supplement (aria-hidden); the table below
 * is the authoritative, screen-reader-friendly rendering of the same rows.
 */
export function SyncCoverageTimeline({
    coverage,
    error,
    onBackfillGapAction,
}: SyncCoverageTimelineProps) {
    const [datasetFilter, setDatasetFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");

    const sourceNameById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const source of coverage?.sources ?? []) {
            map[source.source_id] = source.source_name;
        }
        return map;
    }, [coverage]);

    const sourceLabel = (sourceId: string) => sourceNameById[sourceId] ?? "Unresolved source";

    const datasets = useMemo(() => {
        const all = coverage?.datasets ?? [];
        if (datasetFilter === "all") return all;
        return all.filter((dataset) => dataset.dataset_key === datasetFilter);
    }, [coverage, datasetFilter]);

    if (error) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <DataState variant="error" title="Coverage timeline unavailable" message={error} />
            </div>
        );
    }

    if (!coverage) {
        return (
            <div
                className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                data-testid="coverage-timeline-loading"
            >
                <DataState variant="loading" title="Loading coverage timeline…" />
            </div>
        );
    }

    const hasAnyRangeData = coverage.datasets.some(
        (dataset) =>
            dataset.requested_ranges.length +
                dataset.covered_ranges.length +
                dataset.gaps.length +
                dataset.stale_ranges.length +
                dataset.failed_ranges.length >
            0,
    );

    if (!hasAnyRangeData) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <DataState
                    variant={
                        coverage.data_basis === "legacy"
                            ? "detector-unavailable"
                            : "no-data-connected"
                    }
                    title={
                        coverage.data_basis === "legacy"
                            ? "No planner-tracked coverage yet"
                            : "No coverage data yet"
                    }
                    description={
                        coverage.data_basis === "legacy"
                            ? "This configuration predates planner-tracked syncs, so dataset-level coverage cannot be shown yet."
                            : "Coverage will populate once the first sync run completes."
                    }
                />
            </div>
        );
    }

    return (
        <div className="space-y-4 rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                    Coverage &amp; gaps
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-(--ink-muted)">
                        Dataset
                        <select
                            value={datasetFilter}
                            onChange={(event) => setDatasetFilter(event.target.value)}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                        >
                            <option value="all">{CTA_LABELS.allDatasets}</option>
                            {coverage.datasets.map((dataset) => (
                                <option key={dataset.dataset_key} value={dataset.dataset_key}>
                                    {dataset.dataset_key}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-(--ink-muted)">
                        Source
                        <select
                            value={sourceFilter}
                            onChange={(event) => setSourceFilter(event.target.value)}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                        >
                            <option value="all">{CTA_LABELS.allSources}</option>
                            {coverage.sources.map((source) => (
                                <option key={source.source_id} value={source.source_id}>
                                    {source.source_name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="space-y-6">
                {datasets.map((dataset) => {
                    const extent = datasetExtent(dataset);
                    const activeSourceId = sourceFilter === "all" ? null : sourceFilter;
                    const filterBySource = (ranges: SyncCoverageRange[]) =>
                        ranges.filter((r) => rangeIncludesSource(r, activeSourceId));

                    const rows: TimelineRow[] = [
                        ...filterBySource(dataset.covered_ranges).map((range) => ({
                            kind: "covered" as const,
                            range,
                            datasetKey: dataset.dataset_key,
                        })),
                        ...filterBySource(dataset.gaps).map((range) => ({
                            kind: "gap" as const,
                            range,
                            datasetKey: dataset.dataset_key,
                        })),
                        ...filterBySource(dataset.stale_ranges).map((range) => ({
                            kind: "stale" as const,
                            range,
                            datasetKey: dataset.dataset_key,
                        })),
                        ...filterBySource(dataset.failed_ranges).map((range) => ({
                            kind: "failed" as const,
                            range,
                            datasetKey: dataset.dataset_key,
                        })),
                    ];

                    if (activeSourceId && rows.length === 0) return null;

                    return (
                        <div
                            key={dataset.dataset_key}
                            className="space-y-3 rounded-lg border border-(--card-stroke) bg-(--card-70) p-4"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-foreground">
                                    {dataset.dataset_key}
                                </span>
                                <CoverageBadge
                                    tone={statusTone(dataset.status)}
                                    label={statusLabel(dataset.status)}
                                />
                            </div>

                            {/* Decorative CSS band view — purely visual, mirrored by the table below. */}
                            {extent && (
                                <div aria-hidden="true" className="space-y-1.5">
                                    {(["covered", "gap", "stale", "failed"] as BandKind[]).map(
                                        (kind) => {
                                            const kindRanges = rows.filter(
                                                (row) => row.kind === kind,
                                            );
                                            if (kindRanges.length === 0) return null;
                                            return (
                                                <div key={kind} className="flex items-center gap-2">
                                                    <span className="w-16 shrink-0 text-xs text-(--ink-muted)">
                                                        {BAND_LABEL[kind]}
                                                    </span>
                                                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-(--card-stroke)">
                                                        {kindRanges.map((row) => (
                                                            <div
                                                                key={rangeKey(kind, row.range)}
                                                                className={`absolute top-0 h-full rounded-full ${BAND_BAR_CLASS[kind]}`}
                                                                style={bandStyle(row.range, extent)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            )}

                            {/* Accessible table fallback — the authoritative rendering. */}
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-(--card-stroke) text-sm">
                                    <caption className="sr-only">
                                        Coverage windows for dataset {dataset.dataset_key}
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th
                                                scope="col"
                                                className="px-2 py-2 text-left font-medium text-(--ink-muted)"
                                            >
                                                Window
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-2 py-2 text-left font-medium text-(--ink-muted)"
                                            >
                                                From
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-2 py-2 text-left font-medium text-(--ink-muted)"
                                            >
                                                To
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-2 py-2 text-left font-medium text-(--ink-muted)"
                                            >
                                                Source(s)
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-2 py-2 text-left font-medium text-(--ink-muted)"
                                            >
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-(--card-stroke)">
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="px-2 py-3 text-(--ink-muted)"
                                                >
                                                    No windows recorded for this dataset yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((row) => (
                                                <tr key={rangeKey(row.kind, row.range)}>
                                                    <td className="px-2 py-2">
                                                        <CoverageBadge
                                                            tone={BAND_TONE[row.kind]}
                                                            label={BAND_LABEL[row.kind]}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 text-foreground">
                                                        {formatDateUTC(row.range.since)}
                                                    </td>
                                                    <td className="px-2 py-2 text-foreground">
                                                        {formatDateUTC(row.range.before)}
                                                    </td>
                                                    <td className="px-2 py-2 text-(--ink-muted)">
                                                        {row.range.source_ids.length === 0
                                                            ? "—"
                                                            : row.range.source_ids
                                                                  .map((id) => sourceLabel(id))
                                                                  .join(", ")}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {row.kind === "gap" ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onBackfillGapAction(row.range)
                                                                }
                                                                className="text-(--accent) hover:underline"
                                                            >
                                                                {CTA_LABELS.backfillThisGap}
                                                            </button>
                                                        ) : (
                                                            <span className="text-(--ink-muted)">
                                                                —
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
