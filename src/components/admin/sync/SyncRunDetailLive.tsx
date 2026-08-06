"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber, formatPercent, formatDateUTC } from "@/lib/formatters";
import { type SyncStatus, isTerminalSyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";
import type { SyncRun, SyncRunUnit, SyncRunUnitSummary } from "@/lib/admin/types";

/** How often to refresh live run + unit state while non-terminal. */
const POLL_INTERVAL_MS = 3500;
/** Safety cap so a stuck/abandoned run never polls forever (~10 min). */
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

/** Distinct unit statuses, in a stable display order, for the status filter. */
const STATUS_FILTER_ORDER = [
    "success",
    "failed",
    "retrying",
    "running",
    "dispatched",
    "dispatching",
    "pending",
    "planned",
    "cancelled",
];

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

/**
 * A `retrying` unit currently blocked on the sync budget guard (CHAOS-3412):
 * still within its deferral caps, waiting for the next scheduled attempt.
 * Distinct from a generic retry so operators don't read it as silent nothing.
 */
function isBudgetBlockedUnit(unit: SyncRunUnit): boolean {
    return unit.status === "retrying" && unit.error_category === "budget_deferred";
}

/**
 * A `failed` unit that exhausted its budget-deferral caps (CHAOS-3412) —
 * terminal, with an actionable `error` naming the bucket, cap, and remedies.
 */
function isBudgetExhaustedUnit(unit: SyncRunUnit): boolean {
    return unit.status === "failed" && unit.error_category === "budget_deferral_exhausted";
}

/**
 * A `failed` unit that hit the aggregate deferral cap (CHAOS-3412) — it
 * oscillated between budget and rate-limit deferral episodes without ever
 * running. Terminal, with an actionable `error` naming the last episode kind
 * and both counters.
 */
function isDeferralsExhaustedUnit(unit: SyncRunUnit): boolean {
    return unit.status === "failed" && unit.error_category === "deferral_exhausted";
}

/**
 * Distinct badge treatment for budget-guard states, styled with the same
 * theme-aware token idiom used elsewhere for warning/negative tones
 * (ByoLlmErrorStates.tsx) — soft opacity border, never a bright literal one.
 */
function BudgetGuardBadge({ tone, label }: { tone: "blocked" | "exhausted"; label: string }) {
    const toneClasses =
        tone === "blocked"
            ? "border-(--accent-3)/40 bg-(--accent-3)/10 text-(--accent-3)"
            : "border-(--accent-negative)/40 bg-(--accent-negative)/10 text-(--accent-negative)";
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClasses}`}
        >
            {label}
        </span>
    );
}

/**
 * Chip for a dataset still ratcheting toward the current time (CHAOS-3430).
 * Uses the theme-aware token idiom already used for warning tones — soft
 * opacity border, never a bright literal one, so it reads correctly in dark.
 */
function CatchingUpBadge() {
    return (
        <span className="inline-flex items-center rounded-full border border-(--accent-3)/40 bg-(--accent-3)/10 px-2.5 py-0.5 text-xs font-semibold text-(--accent-3)">
            Catching up
        </span>
    );
}

function statusCount(summary: SyncRunUnitSummary | null, status: string): number | null {
    if (!summary) return null;
    return summary.by_status[status] ?? 0;
}

function totalUnitCount(run: SyncRun, summary: SyncRunUnitSummary | null): number {
    return summary ? Math.max(summary.unit_count, run.total_units) : run.total_units;
}

function effectiveRunStatus(run: SyncRun, summary: SyncRunUnitSummary | null): string {
    if (!summary) return run.status;

    const successCount = statusCount(summary, "success") ?? 0;
    const failedCount = statusCount(summary, "failed") ?? 0;
    const settledCount = successCount + failedCount;
    const totalUnits = totalUnitCount(run, summary);
    if (totalUnits > 0 && settledCount >= totalUnits) {
        if (failedCount === 0) return "success";
        if (successCount === 0) return "failed";
        return "partial_failed";
    }
    if (
        settledCount > 0 ||
        (statusCount(summary, "running") ?? 0) > 0 ||
        (statusCount(summary, "retrying") ?? 0) > 0
    ) {
        return "running";
    }
    if ((statusCount(summary, "dispatching") ?? 0) > 0) return "dispatching";
    if ((statusCount(summary, "planned") ?? 0) > 0) return "planned";
    return run.status;
}

function formatDuration(seconds: number | null): string {
    if (seconds == null) return "—";
    if (seconds < 60) return `${formatNumber(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${formatNumber(minutes)}m ${formatNumber(remainder)}s`;
}

interface UnitWindow {
    since: string | null;
    before: string | null;
}

/**
 * Extent (min since_at, max before_at) spanning the given units — a simple
 * display aggregate, NOT interval merging/gap subtraction (CHAOS-2794 scope:
 * "min/max for display is fine, no coverage math beyond that"). Renders
 * ONLY the persisted per-unit windows already returned by the units API.
 */
function computeWindow(units: readonly SyncRunUnit[]): UnitWindow {
    let sinceMs = Number.POSITIVE_INFINITY;
    let beforeMs = Number.NEGATIVE_INFINITY;
    for (const unit of units) {
        if (unit.since_at) {
            const t = Date.parse(unit.since_at);
            if (!Number.isNaN(t)) sinceMs = Math.min(sinceMs, t);
        }
        if (unit.before_at) {
            const t = Date.parse(unit.before_at);
            if (!Number.isNaN(t)) beforeMs = Math.max(beforeMs, t);
        }
    }
    return {
        since: Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : null,
        before: Number.isFinite(beforeMs) ? new Date(beforeMs).toISOString() : null,
    };
}

function formatWindow(window: UnitWindow): string {
    if (!window.since && !window.before) return "No window recorded";
    const since = window.since ? formatDateUTC(window.since) : "—";
    const before = window.before ? formatDateUTC(window.before) : "—";
    return `${since} → ${before}`;
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

    const currentRunStatus = effectiveRunStatus(run, summary);
    const liveStatus = mapPlannerRunStatus(currentRunStatus);
    const isTerminal = isTerminalSyncStatus(liveStatus);

    // Poll run + unit state while the run is non-terminal, mirroring the
    // cleanup/timeout discipline in useSyncTrigger.ts. State is only mutated
    // inside the async interval callback (never synchronously in the effect
    // body), so react-hooks/set-state-in-effect stays satisfied.
    useEffect(() => {
        if (testMode) return undefined;
        if (isTerminal) return undefined;

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
                const nextLiveStatus = mapPlannerRunStatus(
                    effectiveRunStatus(nextRun, unitsRes.data),
                );
                if (isTerminalSyncStatus(nextLiveStatus)) {
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
    }, [testMode, runId, isTerminal, stopPolling]);

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

    const total = totalUnitCount(run, summary);
    const completed = statusCount(summary, "success") ?? run.completed_units;
    const failed = statusCount(summary, "failed") ?? run.failed_units;
    const settled = Math.min(total, completed + failed);
    const percent = total > 0 ? Math.min(100, Math.round((settled / total) * 100)) : 0;

    const attentionUnits = useMemo(
        () =>
            (summary?.units ?? []).filter(
                (unit) => unit.status === "failed" || unit.status === "retrying",
            ),
        [summary],
    );

    // Unit table filters (CHAOS-2794) — client-side over the already-fetched
    // unit summary; narrows which persisted rows are displayed, never
    // re-derives coverage/category truth.
    const [statusFilter, setStatusFilter] = useState("all");
    const [datasetFilter, setDatasetFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [failedOnlyFilter, setFailedOnlyFilter] = useState(false);
    const [sinceFilter, setSinceFilter] = useState("");
    const [beforeFilter, setBeforeFilter] = useState("");

    const availableStatuses = useMemo(() => {
        const present = new Set((summary?.units ?? []).map((unit) => unit.status));
        return STATUS_FILTER_ORDER.filter((status) => present.has(status));
    }, [summary]);

    const availableDatasets = useMemo(
        () => Array.from(new Set((summary?.units ?? []).map((unit) => unit.dataset_key))).sort(),
        [summary],
    );

    const availableSourceIds = useMemo(
        () => Array.from(new Set((summary?.units ?? []).map((unit) => unit.source_id))),
        [summary],
    );

    const filteredUnits = useMemo(() => {
        const units = summary?.units ?? [];
        const sinceBoundary = sinceFilter ? Date.parse(`${sinceFilter}T00:00:00.000Z`) : null;
        const beforeBoundary = beforeFilter ? Date.parse(`${beforeFilter}T23:59:59.999Z`) : null;
        return units.filter((unit) => {
            if (statusFilter !== "all" && unit.status !== statusFilter) return false;
            if (datasetFilter !== "all" && unit.dataset_key !== datasetFilter) return false;
            if (sourceFilter !== "all" && unit.source_id !== sourceFilter) return false;
            if (failedOnlyFilter && unit.status !== "failed" && unit.status !== "retrying") {
                return false;
            }
            if (sinceBoundary !== null) {
                const unitBefore = unit.before_at ? Date.parse(unit.before_at) : null;
                if (
                    unitBefore !== null &&
                    !Number.isNaN(unitBefore) &&
                    unitBefore < sinceBoundary
                ) {
                    return false;
                }
            }
            if (beforeBoundary !== null) {
                const unitSince = unit.since_at ? Date.parse(unit.since_at) : null;
                if (unitSince !== null && !Number.isNaN(unitSince) && unitSince > beforeBoundary) {
                    return false;
                }
            }
            return true;
        });
    }, [
        summary,
        statusFilter,
        datasetFilter,
        sourceFilter,
        failedOnlyFilter,
        sinceFilter,
        beforeFilter,
    ]);

    const hasActiveUnitFilters =
        statusFilter !== "all" ||
        datasetFilter !== "all" ||
        sourceFilter !== "all" ||
        failedOnlyFilter ||
        sinceFilter !== "" ||
        beforeFilter !== "";

    // Intent vs result (CHAOS-2794): requested window spans ALL units
    // regardless of outcome; covered window spans SUCCESSFUL units only.
    // Both are simple min/max display aggregates over persisted fields —
    // counts below come from the persisted `by_status` rollup, never
    // recomputed client-side.
    // Datasets still ratcheting (CHAOS-3430). Filters the persisted freshness
    // rollup to entries the BACKEND flagged — the verdict, the tick estimate,
    // and the lag are all backend state; nothing here is recomputed from a
    // timestamp. An absent field means "no lag information", which renders as
    // no panel rather than as "nothing is behind".
    const catchingUpDatasets = useMemo(
        () => (summary?.dataset_freshness ?? []).filter((entry) => entry.catching_up),
        [summary],
    );

    const requestedWindow = useMemo(() => computeWindow(summary?.units ?? []), [summary]);
    const coveredWindow = useMemo(
        () => computeWindow((summary?.units ?? []).filter((unit) => unit.status === "success")),
        [summary],
    );

    return (
        <div className="space-y-6">
            {/* Run header */}
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <SyncStatusBadge status={liveStatus} className="text-sm px-3 py-1" />
                            <span
                                className="text-sm text-(--ink-muted)"
                                role="status"
                                aria-live="polite"
                            >
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
                                <dd className="text-foreground">{currentRunStatus}</dd>
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

            {/* Intent vs result (CHAOS-2794): run mode + requested window (min/max
                across all units) vs covered window (successful units only) vs
                failed count. Renders ONLY persisted fields — by_status counts
                come straight from the units-summary rollup; windows are a
                simple min/max display aggregate, never coverage/gap math. */}
            {summary && (
                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="mb-3 text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Intent vs result
                    </h3>
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Mode
                            </dt>
                            <dd className="mt-1 text-foreground">{run.mode}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Requested window
                            </dt>
                            <dd className="mt-1 text-foreground">
                                {formatWindow(requestedWindow)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Covered window
                            </dt>
                            <dd className="mt-1 text-foreground">
                                {formatWindow(coveredWindow)}{" "}
                                <span className="text-(--ink-muted)">
                                    ({formatNumber(summary.by_status.success ?? 0)} unit
                                    {(summary.by_status.success ?? 0) === 1 ? "" : "s"})
                                </span>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Failed
                            </dt>
                            <dd className="mt-1 text-foreground">
                                {formatNumber(summary.by_status.failed ?? 0)} unit
                                {(summary.by_status.failed ?? 0) === 1 ? "" : "s"}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            {/* Catching up (CHAOS-3430): a high-cost dataset syncs through
                capped incremental windows, one per scheduled tick, and each
                capped tick finalizes as an ordinary SUCCESS. Run status alone
                therefore reads "complete" while coverage is still weeks back.
                Every value below is persisted backend state from the units
                summary — the catch-up verdict, the tick estimate, and the
                watermark. Nothing is re-derived at render time. */}
            {catchingUpDatasets.length > 0 && (
                <section
                    aria-labelledby="catching-up-heading"
                    className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3
                            id="catching-up-heading"
                            className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Catching up
                        </h3>
                        <span className="text-xs text-(--ink-muted)">
                            {formatNumber(catchingUpDatasets.length)} dataset
                            {catchingUpDatasets.length === 1 ? "" : "s"} still catching up
                        </span>
                    </div>
                    <p className="mb-3 text-xs text-(--ink-muted)">
                        These datasets synchronize one capped window per scheduled run, so a
                        successful run does not yet mean full coverage. Scoped to this run — it
                        covers only the sources and datasets this run planned, not the whole
                        workspace.
                    </p>
                    <ul className="space-y-3">
                        {catchingUpDatasets.map((entry) => (
                            <li
                                key={`${entry.source_id}:${entry.dataset_key}`}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 text-sm"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium text-foreground">
                                        {entry.source_name ?? sourceLabel(entry.source_id)} ·{" "}
                                        {entry.dataset_key}
                                    </span>
                                    <CatchingUpBadge />
                                </div>
                                {/* The persisted `catching_up` verdict is the
                                    backend's and is rendered above regardless.
                                    The DISTANCE, though, is only claimable when
                                    a watermark was actually recorded: with none,
                                    say so plainly rather than asserting a
                                    measured lag (or printing a bare dash that
                                    reads as one). */}
                                <div className="mt-1 text-xs text-(--ink-muted)">
                                    {entry.watermark_at ? (
                                        <>
                                            <span>
                                                Watermark at{" "}
                                                <ClientTimestamp
                                                    value={entry.watermark_at}
                                                    fallback="—"
                                                />
                                            </span>
                                            {entry.ticks_behind != null && (
                                                <span>
                                                    {" · "}~{formatNumber(entry.ticks_behind)} tick
                                                    {entry.ticks_behind === 1 ? "" : "s"} behind
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <span>Watermark unavailable — progress not measurable</span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Overall progress */}
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">Overall progress</span>
                    <span className="text-(--ink-muted)">
                        {formatNumber(settled)} / {formatNumber(total)} ({formatPercent(percent)})
                    </span>
                </div>
                <div
                    className="h-2 w-full overflow-hidden rounded-full bg-(--card-70)"
                    role="progressbar"
                    aria-label="Overall sync progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={`${formatNumber(settled)} of ${formatNumber(total)} units settled`}
                >
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
                                <div className="flex flex-wrap items-center gap-3">
                                    {typeof summary.budget_blocked_unit_count === "number" &&
                                        summary.budget_blocked_unit_count > 0 && (
                                            <span className="text-xs text-(--ink-muted)">
                                                Budget blocked:{" "}
                                                {formatNumber(summary.budget_blocked_unit_count)}
                                            </span>
                                        )}
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
                                            {isBudgetBlockedUnit(unit) ? (
                                                <BudgetGuardBadge
                                                    tone="blocked"
                                                    label="Blocked: budget"
                                                />
                                            ) : isBudgetExhaustedUnit(unit) ? (
                                                <BudgetGuardBadge
                                                    tone="exhausted"
                                                    label="Budget exhausted"
                                                />
                                            ) : isDeferralsExhaustedUnit(unit) ? (
                                                <BudgetGuardBadge
                                                    tone="exhausted"
                                                    label="Deferrals exhausted"
                                                />
                                            ) : (
                                                <SyncStatusBadge
                                                    status={unitBadgeStatus(unit.status)}
                                                    label={unit.status}
                                                />
                                            )}
                                        </div>
                                        <div className="mt-1 text-xs text-(--ink-muted)">
                                            {isBudgetBlockedUnit(unit) ? (
                                                <>
                                                    {typeof unit.budget_deferrals === "number" && (
                                                        <span>
                                                            {formatNumber(unit.budget_deferrals)}{" "}
                                                            deferral
                                                            {unit.budget_deferrals === 1 ? "" : "s"}
                                                        </span>
                                                    )}
                                                    {typeof unit.budget_deferrals === "number" &&
                                                        unit.available_at &&
                                                        " · "}
                                                    {unit.available_at && (
                                                        <span>
                                                            Next attempt{" "}
                                                            <ClientTimestamp
                                                                value={unit.available_at}
                                                                fallback="—"
                                                            />
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    {unit.error_category && (
                                                        <span>Category: {unit.error_category}</span>
                                                    )}
                                                    {unit.error_category &&
                                                        unit.available_at &&
                                                        " · "}
                                                    {unit.available_at && (
                                                        <span>
                                                            Retry at{" "}
                                                            <ClientTimestamp
                                                                value={unit.available_at}
                                                                fallback="—"
                                                            />
                                                        </span>
                                                    )}
                                                </>
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
                            Units ({formatNumber(filteredUnits.length)}
                            {hasActiveUnitFilters ? ` of ${formatNumber(summary.unit_count)}` : ""})
                        </h3>

                        {/* Client-side filters over the already-fetched unit summary
                            (CHAOS-2794) — narrows the table below only; the persisted
                            rollups (Unit status / By dataset / By source / By cost class)
                            above always reflect the full run. */}
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                                Status
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                                >
                                    <option value="all">{CTA_LABELS.allStatuses}</option>
                                    {availableStatuses.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                                Dataset
                                <select
                                    value={datasetFilter}
                                    onChange={(event) => setDatasetFilter(event.target.value)}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                                >
                                    <option value="all">{CTA_LABELS.allDatasets}</option>
                                    {availableDatasets.map((dataset) => (
                                        <option key={dataset} value={dataset}>
                                            {dataset}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                                Source
                                <select
                                    value={sourceFilter}
                                    onChange={(event) => setSourceFilter(event.target.value)}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                                >
                                    <option value="all">{CTA_LABELS.allSources}</option>
                                    {availableSourceIds.map((sourceId) => (
                                        <option key={sourceId} value={sourceId}>
                                            {sourceLabel(sourceId)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                                Since
                                <input
                                    type="date"
                                    value={sinceFilter}
                                    onChange={(event) => setSinceFilter(event.target.value)}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                                Before
                                <input
                                    type="date"
                                    value={beforeFilter}
                                    onChange={(event) => setBeforeFilter(event.target.value)}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                                />
                            </label>
                            <label className="flex items-center gap-2 pb-1.5 text-sm text-(--ink-muted)">
                                <input
                                    type="checkbox"
                                    checked={failedOnlyFilter}
                                    onChange={(event) => setFailedOnlyFilter(event.target.checked)}
                                    className="h-4 w-4 rounded border-(--card-stroke)"
                                />
                                Failed/retrying only
                            </label>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
                            <table className="min-w-full divide-y divide-(--card-stroke)">
                                <thead className="bg-(--card-bg)">
                                    <tr>
                                        {[
                                            "Unit",
                                            "Source",
                                            "Dataset",
                                            "Since",
                                            "Before",
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
                                    {filteredUnits.map((unit: SyncRunUnit) => (
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
                                                {formatDateUTC(unit.since_at)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {formatDateUTC(unit.before_at)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                                {unit.cost_class}
                                            </td>
                                            <td className="px-4 py-3">
                                                {isBudgetBlockedUnit(unit) ? (
                                                    <BudgetGuardBadge
                                                        tone="blocked"
                                                        label="Blocked: budget"
                                                    />
                                                ) : isBudgetExhaustedUnit(unit) ? (
                                                    <BudgetGuardBadge
                                                        tone="exhausted"
                                                        label="Budget exhausted"
                                                    />
                                                ) : isDeferralsExhaustedUnit(unit) ? (
                                                    <BudgetGuardBadge
                                                        tone="exhausted"
                                                        label="Deferrals exhausted"
                                                    />
                                                ) : (
                                                    <SyncStatusBadge
                                                        status={unitBadgeStatus(unit.status)}
                                                        label={unit.status}
                                                    />
                                                )}
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
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
