"use client";

import { useMemo, useState } from "react";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateUTC } from "@/lib/formatters";
import type {
    SyncCoverageBackfillWindow,
    SyncCoverageDataset,
    SyncCoverageRange,
    SyncCoverageSummary,
} from "@/lib/admin/types";
import { CoverageBadge, statusLabel, statusTone, type CoverageTone } from "./CoverageBadge";

interface SyncCoverageTimelineProps {
    coverage: SyncCoverageSummary | null;
    error?: string | null;
    /** Opens the backfill wizard with a server-owned or legacy-compatible date window. */
    onBackfillWindowAction: (range: SyncCoverageBackfillWindow) => void;
    /** Opens the wizard with several exact server-owned selectors. */
    onBackfillWindowsAction?: (ranges: SyncCoverageBackfillWindow[]) => void;
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

function windowLabel(window: SyncCoverageBackfillWindow): string {
    const datasetScope = window.dataset_keys?.length
        ? window.dataset_keys.join(", ")
        : "all datasets";
    return `${formatDateUTC(window.since)} – ${formatDateUTC(window.before)} · ${datasetScope}`;
}

function backfillWindowKey(window: SyncCoverageBackfillWindow): string {
    return [
        window.since,
        window.before,
        [...(window.dataset_keys ?? [])].sort().join(","),
        [...(window.source_ids ?? [])].sort().join(","),
    ].join("|");
}

function selectionReason(window: SyncCoverageBackfillWindow): "gap" | "failed" {
    return window.reasons?.includes("failed") && !window.reasons.includes("gap") ? "failed" : "gap";
}

function windowSelectionLabel(window: SyncCoverageBackfillWindow): string {
    return `Select ${selectionReason(window)} ${formatDateUTC(window.since)} to ${formatDateUTC(window.before)} for backfill`;
}

function sameBoundary(left: string, right: string): boolean {
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();
    return Number.isFinite(leftTime) && leftTime === rightTime;
}

function sameScope(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const sortedLeft = [...left].sort();
    const sortedRight = [...right].sort();
    return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Return the server-authorized windows for this exact dataset/source gap or
 * failure. An explicit empty array is authoritative: it never falls back to a
 * client inferred action. The undefined fallback is for an independently
 * deployed legacy Ops server that did not emit the contract field yet.
 */
function backfillWindowsForRow(
    row: TimelineRow,
    backfillWindows: SyncCoverageBackfillWindow[] | undefined,
): SyncCoverageBackfillWindow[] {
    if (backfillWindows === undefined) {
        return [
            {
                since: row.range.since,
                before: row.range.before,
                source_ids: row.range.source_ids,
                dataset_keys: [row.datasetKey],
            },
        ];
    }

    return backfillWindows.filter(
        (window) =>
            window.dataset_keys !== undefined &&
            window.dataset_keys.length > 0 &&
            window.dataset_keys.includes(row.datasetKey) &&
            window.source_ids !== undefined &&
            sameScope(window.source_ids, row.range.source_ids) &&
            sameBoundary(window.since, row.range.since) &&
            sameBoundary(window.before, row.range.before),
    );
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

function serverCoverageExtent(coverage: SyncCoverageSummary): [number, number] | null {
    if (!coverage.coverage_since || !coverage.coverage_through) return null;
    const start = new Date(coverage.coverage_since).getTime();
    const end = new Date(coverage.coverage_through).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return [start, end];
}

function timelineExtent(
    coverage: SyncCoverageSummary,
    dataset: SyncCoverageDataset,
): [number, number] | null {
    const server = serverCoverageExtent(coverage);
    const data = datasetExtent(dataset);
    if (!server) return data;
    if (!data) return server;
    return [Math.min(server[0], data[0]), Math.max(server[1], data[1])];
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
    onBackfillWindowAction,
    onBackfillWindowsAction,
}: SyncCoverageTimelineProps) {
    const [datasetFilter, setDatasetFilter] = useState<string>("all");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [selectedBackfillWindowKeys, setSelectedBackfillWindowKeys] = useState<string[]>([]);

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

    const selectedBackfillWindows = useMemo(() => {
        const selected = new Set(selectedBackfillWindowKeys);
        return (coverage?.backfill_windows ?? []).filter((window) =>
            selected.has(backfillWindowKey(window)),
        );
    }, [coverage?.backfill_windows, selectedBackfillWindowKeys]);

    const toggleBackfillWindow = (window: SyncCoverageBackfillWindow) => {
        const key = backfillWindowKey(window);
        setSelectedBackfillWindowKeys((current) =>
            current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
        );
    };

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
    const hasCanonicalBackfill = (coverage.backfill_windows?.length ?? 0) > 0;

    if (!hasAnyRangeData && !hasCanonicalBackfill) {
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

            {coverage.backfill_windows !== undefined && coverage.backfill_windows.length > 0 && (
                <div
                    className="space-y-3 rounded-lg border border-(--card-stroke) bg-(--card-70) p-4"
                    data-testid="coverage-backfill-windows"
                >
                    <div>
                        <h4 className="font-medium text-foreground">Available backfills</h4>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            These exact, scoped windows are authorized by the coverage service.
                        </p>
                    </div>
                    <ul className="space-y-2">
                        {coverage.backfill_windows.map((window) => (
                            <li
                                key={backfillWindowKey(window)}
                                className="flex flex-wrap items-center justify-between gap-3"
                            >
                                <label className="flex min-w-0 items-start gap-2 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select suggested ${selectionReason(window)} ${formatDateUTC(window.since)} to ${formatDateUTC(window.before)} for backfill`}
                                        checked={selectedBackfillWindowKeys.includes(
                                            backfillWindowKey(window),
                                        )}
                                        onChange={() => toggleBackfillWindow(window)}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        {formatDateUTC(window.since)} –{" "}
                                        {formatDateUTC(window.before)}
                                        {window.dataset_keys && window.dataset_keys.length > 0 && (
                                            <> · {window.dataset_keys.join(", ")}</>
                                        )}
                                        {window.source_ids && window.source_ids.length > 0 && (
                                            <> · {window.source_ids.map(sourceLabel).join(", ")}</>
                                        )}
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    aria-label={`Backfill ${formatDateUTC(window.since)} to ${formatDateUTC(window.before)}`}
                                    onClick={() => onBackfillWindowAction(window)}
                                    className="text-sm font-medium text-(--accent) hover:underline"
                                >
                                    {CTA_LABELS.backfillThisWindow}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {onBackfillWindowsAction && (
                        <div className="flex justify-end border-t border-(--card-stroke) pt-3">
                            <button
                                type="button"
                                disabled={selectedBackfillWindows.length === 0}
                                onClick={() => onBackfillWindowsAction(selectedBackfillWindows)}
                                className="rounded-md bg-(--accent) px-3 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                            >
                                Backfill selected ({selectedBackfillWindows.length})
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-6">
                {datasets.map((dataset) => {
                    const extent = timelineExtent(coverage, dataset);
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
                                                                data-testid={`coverage-${kind}-band-${dataset.dataset_key}`}
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
                                            rows.map((row) => {
                                                const backfillWindows =
                                                    row.kind === "gap" || row.kind === "failed"
                                                        ? backfillWindowsForRow(
                                                              row,
                                                              coverage.backfill_windows,
                                                          )
                                                        : [];
                                                return (
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
                                                            {backfillWindows.length === 1 ? (
                                                                <div className="flex items-center gap-2">
                                                                    {onBackfillWindowsAction &&
                                                                        coverage.backfill_windows !==
                                                                            undefined && (
                                                                            <input
                                                                                type="checkbox"
                                                                                aria-label={`Select ${row.kind} ${formatDateUTC(row.range.since)} to ${formatDateUTC(row.range.before)} for backfill`}
                                                                                checked={selectedBackfillWindowKeys.includes(
                                                                                    backfillWindowKey(
                                                                                        backfillWindows[0],
                                                                                    ),
                                                                                )}
                                                                                onChange={() =>
                                                                                    toggleBackfillWindow(
                                                                                        backfillWindows[0],
                                                                                    )
                                                                                }
                                                                            />
                                                                        )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            onBackfillWindowAction(
                                                                                backfillWindows[0],
                                                                            )
                                                                        }
                                                                        className="text-(--accent) hover:underline"
                                                                    >
                                                                        {row.kind === "failed"
                                                                            ? CTA_LABELS.backfillThisFailure
                                                                            : CTA_LABELS.backfillThisGap}
                                                                    </button>
                                                                </div>
                                                            ) : backfillWindows.length > 1 ? (
                                                                <div className="flex flex-col gap-1">
                                                                    {backfillWindows.map(
                                                                        (window) => (
                                                                            <div
                                                                                key={backfillWindowKey(
                                                                                    window,
                                                                                )}
                                                                                className="flex items-start gap-2"
                                                                            >
                                                                                {onBackfillWindowsAction &&
                                                                                    coverage.backfill_windows !==
                                                                                        undefined && (
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            aria-label={windowSelectionLabel(
                                                                                                window,
                                                                                            )}
                                                                                            checked={selectedBackfillWindowKeys.includes(
                                                                                                backfillWindowKey(
                                                                                                    window,
                                                                                                ),
                                                                                            )}
                                                                                            onChange={() =>
                                                                                                toggleBackfillWindow(
                                                                                                    window,
                                                                                                )
                                                                                            }
                                                                                        />
                                                                                    )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        onBackfillWindowAction(
                                                                                            window,
                                                                                        )
                                                                                    }
                                                                                    className="text-left text-(--accent) hover:underline"
                                                                                >
                                                                                    {
                                                                                        CTA_LABELS.backfillThisWindow
                                                                                    }
                                                                                    <span className="block text-xs text-(--ink-muted)">
                                                                                        {windowLabel(
                                                                                            window,
                                                                                        )}
                                                                                    </span>
                                                                                </button>
                                                                            </div>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            ) : row.kind === "gap" ||
                                                              row.kind === "failed" ? (
                                                                <span className="text-xs text-(--ink-muted)">
                                                                    No exact backfill suggestion
                                                                </span>
                                                            ) : (
                                                                <span className="text-(--ink-muted)">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
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
