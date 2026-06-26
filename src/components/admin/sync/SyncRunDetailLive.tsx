"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { formatNumber, formatPercent } from "@/lib/formatters";
import { type SyncStatus, isTerminalSyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";
import type { SyncRun, SyncRunUnit, SyncRunUnitSummary } from "@/lib/admin/types";

/** How often to refresh live run + unit state while non-terminal. */
const POLL_INTERVAL_MS = 3500;
/** Safety cap so a stuck/abandoned run never polls forever (~10 min). */
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;
/** Cap the rendered unit table so a huge fan-out stays readable. */
const UNIT_TABLE_CAP = 100;

interface SyncRunDetailLiveProps {
    initialRun: SyncRun;
    /** Null when the units fetch errored server-side; see initialUnitsError. */
    initialSummary: SyncRunUnitSummary | null;
    /** Server-side units-fetch error message, if any (render-only notice). */
    initialUnitsError?: string | null;
    /** When true, render the provided sample data and never poll a live API. */
    testMode?: boolean;
}

/** Map a backend unit status string onto the shared badge status union. */
function unitBadgeStatus(status: string): SyncStatus {
    switch (status) {
        case "success":
            return "success";
        case "failed":
        case "cancelled":
            return "failed";
        case "running":
        case "retrying":
        case "dispatched":
        case "dispatching":
            return "running";
        case "pending":
        case "planned":
            return "idle";
        default:
            return "idle";
    }
}

function formatDuration(seconds: number | null): string {
    if (seconds == null) return "—";
    if (seconds < 60) return `${formatNumber(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${formatNumber(minutes)}m ${formatNumber(remainder)}s`;
}

function StatBreakdown({ counts }: { counts: Record<string, number> }) {
    const entries = Object.entries(counts);
    if (entries.length === 0) {
        return <p className="text-sm text-(--ink-muted)">No data yet.</p>;
    }
    return (
        <ul className="space-y-1.5">
            {entries.map(([key, count]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{key}</span>
                    <span className="font-medium text-(--ink-muted)">{formatNumber(count)}</span>
                </li>
            ))}
        </ul>
    );
}

function NestedBreakdown({
    groups,
    labelFor,
}: {
    groups: Record<string, Record<string, number>>;
    labelFor?: (key: string) => string;
}) {
    const entries = Object.entries(groups);
    if (entries.length === 0) {
        return <p className="text-sm text-(--ink-muted)">No data yet.</p>;
    }
    return (
        <ul className="space-y-3">
            {entries.map(([key, statuses]) => {
                const total = Object.values(statuses).reduce((sum, n) => sum + n, 0);
                return (
                    <li key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">
                                {labelFor ? labelFor(key) : key}
                            </span>
                            <span className="text-(--ink-muted)">{formatNumber(total)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(statuses).map(([status, count]) => (
                                <span
                                    key={status}
                                    className="rounded-full bg-(--card-70) px-2 py-0.5 text-xs text-(--ink-muted)"
                                >
                                    {status}: {formatNumber(count)}
                                </span>
                            ))}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export function SyncRunDetailLive({
    initialRun,
    initialSummary,
    initialUnitsError = null,
    testMode = false,
}: SyncRunDetailLiveProps) {
    const runId = initialRun.id;
    const [run, setRun] = useState<SyncRun>(initialRun);
    const [summary, setSummary] = useState<SyncRunUnitSummary | null>(initialSummary);
    const [unitsError, setUnitsError] = useState<string | null>(initialUnitsError);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Monotonic sequence: every tick and every stopPolling bumps it, so any
    // in-flight response whose seq is no longer current (slow poll resolving
    // after a later terminal tick, the safety timeout, or unmount) is ignored
    // and can never overwrite terminal/cleared state (FIX 3).
    const seqRef = useRef(0);
    // Guard against overlapping ticks if a poll outlives the interval period.
    const inFlightRef = useRef(false);

    const stopPolling = useCallback(() => {
        // Invalidate any in-flight response so it cannot mutate state post-stop.
        seqRef.current += 1;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    // Poll run + unit state while the run is non-terminal, mirroring the
    // cleanup/timeout discipline in useSyncTrigger.ts. State is only mutated
    // inside the async interval callback (never synchronously in the effect
    // body), so react-hooks/set-state-in-effect stays satisfied.
    useEffect(() => {
        if (testMode) return undefined;
        if (isTerminalSyncStatus(mapPlannerRunStatus(initialRun.status))) return undefined;

        let cancelled = false;

        const tick = async () => {
            // Skip overlapping ticks: only one request set in flight at a time.
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            const seq = (seqRef.current += 1);
            try {
                const [runRes, unitsRes] = await Promise.all([
                    getSyncRunStatus(runId),
                    getSyncRunUnits(runId),
                ]);
                // Ignore stale/unmounted/post-stop responses (FIX 3).
                if (cancelled || seq !== seqRef.current) return;

                // withErrorHandling RETURNS { error } (never throws), so a failed
                // poll arrives as data:undefined. Do NOT apply blindly: stop and
                // surface a non-fatal indicator instead of spinning or rendering
                // stale/empty data (FIX 2).
                if (runRes.error || unitsRes.error || !runRes.data || !unitsRes.data) {
                    stopPolling();
                    setUnitsError(
                        runRes.error ?? unitsRes.error ?? "Live updates are unavailable.",
                    );
                    return;
                }

                setSummary(unitsRes.data);
                setUnitsError(null);
                const nextRun = runRes.data;
                setRun(nextRun);
                if (isTerminalSyncStatus(mapPlannerRunStatus(nextRun.status))) {
                    stopPolling();
                }
            } finally {
                inFlightRef.current = false;
            }
        };

        intervalRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
        timeoutRef.current = setTimeout(() => stopPolling(), MAX_POLL_DURATION_MS);

        return () => {
            cancelled = true;
            stopPolling();
        };
    }, [testMode, runId, initialRun.status, stopPolling]);

    const liveStatus = mapPlannerRunStatus(run.status);
    const isTerminal = isTerminalSyncStatus(liveStatus);

    // Resolve source ids → display names from the units themselves. We NEVER
    // surface a raw source id when a resolved name exists (web DoD / A7).
    const sourceNameById = useMemo(() => {
        const map: Record<string, string> = {};
        for (const unit of summary?.units ?? []) {
            const name = unit.source_full_name ?? unit.source_name;
            if (name) map[unit.source_id] = name;
        }
        return map;
    }, [summary]);

    const sourceLabel = useCallback(
        (sourceId: string) => sourceNameById[sourceId] ?? "Unresolved source",
        [sourceNameById],
    );

    const total = run.total_units;
    const completed = run.completed_units;
    const failed = run.failed_units;
    const settled = Math.min(total, completed + failed);
    const percent = total > 0 ? Math.min(100, Math.round((settled / total) * 100)) : 0;

    const attentionUnits = useMemo(
        () =>
            (summary?.units ?? []).filter(
                (unit) => unit.status === "failed" || unit.status === "retrying",
            ),
        [summary],
    );

    const cappedUnits = (summary?.units ?? []).slice(0, UNIT_TABLE_CAP);
    const overflow = (summary?.units.length ?? 0) - cappedUnits.length;

    return (
        <div className="space-y-6">
            {/* Run header */}
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <SyncStatusBadge status={liveStatus} className="text-sm px-3 py-1" />
                            <span className="text-sm text-(--ink-muted)">
                                {isTerminal
                                    ? "Run complete"
                                    : unitsError
                                      ? "Live updates paused"
                                      : "Live — refreshing…"}
                            </span>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Status
                                </dt>
                                <dd className="text-foreground">{run.status}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Mode
                                </dt>
                                <dd className="text-foreground">{run.mode}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Triggered by
                                </dt>
                                <dd className="text-foreground">{run.triggered_by}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Started
                                </dt>
                                <dd className="text-foreground">
                                    <ClientTimestamp value={run.started_at} fallback="—" />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Completed
                                </dt>
                                <dd className="text-foreground">
                                    <ClientTimestamp value={run.completed_at} fallback="—" />
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>

            {/* Overall progress */}
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">Overall progress</span>
                    <span className="text-(--ink-muted)">
                        {formatNumber(settled)} / {formatNumber(total)} ({formatPercent(percent)})
                    </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-70)">
                    <div
                        className="h-full bg-(--accent) transition-all duration-500 ease-out"
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                        <div className="text-xs text-(--ink-muted) uppercase tracking-wider">
                            Completed
                        </div>
                        <div className="text-lg font-medium text-foreground">
                            {formatNumber(completed)}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-(--ink-muted) uppercase tracking-wider">
                            Failed
                        </div>
                        <div className="text-lg font-medium text-foreground">
                            {formatNumber(failed)}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-(--ink-muted) uppercase tracking-wider">
                            Total units
                        </div>
                        <div className="text-lg font-medium text-foreground">
                            {formatNumber(total)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Non-fatal notice: units fetch errored server-side (FIX 1) or a
                live poll failed (FIX 2). Render an explicit indicator rather
                than fabricating empty units. */}
            {unitsError && (
                <div
                    role="alert"
                    className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                >
                    <h3 className="text-sm font-medium text-red-500 uppercase tracking-wider">
                        Unit details unavailable
                    </h3>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Failed to load unit details: {unitsError}
                    </p>
                </div>
            )}

            {summary ? (
                <>
                    {/* Breakdowns */}
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <h3 className="mb-3 text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                                Unit status
                            </h3>
                            <StatBreakdown counts={summary.by_status} />
                        </div>
                        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <h3 className="mb-3 text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                                By dataset
                            </h3>
                            <NestedBreakdown groups={summary.by_dataset} />
                        </div>
                        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <h3 className="mb-3 text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                                By source
                            </h3>
                            <NestedBreakdown groups={summary.by_source} labelFor={sourceLabel} />
                        </div>
                        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <h3 className="mb-3 text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                                By cost class
                            </h3>
                            <StatBreakdown counts={summary.by_cost_class} />
                        </div>
                    </div>

                    {/* Failed / retrying summary */}
                    {attentionUnits.length > 0 && (
                        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                                    Needs attention
                                </h3>
                                {summary.next_retry_at && (
                                    <span className="text-xs text-(--ink-muted)">
                                        Next retry{" "}
                                        <ClientTimestamp
                                            value={summary.next_retry_at}
                                            fallback="—"
                                        />
                                    </span>
                                )}
                            </div>
                            <ul className="space-y-3">
                                {attentionUnits.map((unit) => (
                                    <li
                                        key={unit.id}
                                        className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 text-sm"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-medium text-foreground">
                                                {sourceLabel(unit.source_id)} · {unit.dataset_key}
                                            </span>
                                            <SyncStatusBadge
                                                status={unitBadgeStatus(unit.status)}
                                                label={unit.status}
                                            />
                                        </div>
                                        <div className="mt-1 text-xs text-(--ink-muted)">
                                            {unit.error_category && (
                                                <span>Category: {unit.error_category}</span>
                                            )}
                                            {unit.error_category && unit.available_at && " · "}
                                            {unit.available_at && (
                                                <span>
                                                    Retry at{" "}
                                                    <ClientTimestamp
                                                        value={unit.available_at}
                                                        fallback="—"
                                                    />
                                                </span>
                                            )}
                                        </div>
                                        {unit.error && (
                                            <p className="mt-1 text-xs text-red-500">
                                                {unit.error}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Unit table */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                            Units ({formatNumber(summary.unit_count)})
                        </h3>
                        <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
                            <table className="min-w-full divide-y divide-(--card-stroke)">
                                <thead className="bg-(--card-bg)">
                                    <tr>
                                        {[
                                            "Unit",
                                            "Source",
                                            "Dataset",
                                            "Cost class",
                                            "Status",
                                            "Attempts",
                                            "Duration",
                                            "Detail",
                                        ].map((heading) => (
                                            <th
                                                key={heading}
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                                            >
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-(--card-stroke)">
                                    {cappedUnits.map((unit: SyncRunUnit) => (
                                        <tr key={unit.id}>
                                            <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                                {unit.id.slice(0, 8)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-foreground">
                                                {sourceLabel(unit.source_id)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {unit.dataset_key}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {unit.cost_class}
                                            </td>
                                            <td className="px-4 py-3">
                                                <SyncStatusBadge
                                                    status={unitBadgeStatus(unit.status)}
                                                    label={unit.status}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {formatNumber(unit.attempts)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {formatDuration(unit.duration_seconds)}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {unit.error ? (
                                                    <span className="text-red-500">
                                                        {unit.error}
                                                    </span>
                                                ) : unit.error_category ? (
                                                    <span className="text-(--ink-muted)">
                                                        {unit.error_category}
                                                    </span>
                                                ) : unit.available_at ? (
                                                    <span className="text-(--ink-muted)">
                                                        Retry{" "}
                                                        <ClientTimestamp
                                                            value={unit.available_at}
                                                            fallback="—"
                                                        />
                                                    </span>
                                                ) : (
                                                    <span className="text-(--ink-muted)">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {overflow > 0 && (
                                <div className="border-t border-(--card-stroke) px-4 py-3 text-xs text-(--ink-muted)">
                                    Showing first {formatNumber(UNIT_TABLE_CAP)} of{" "}
                                    {formatNumber(summary.units.length)} units.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
