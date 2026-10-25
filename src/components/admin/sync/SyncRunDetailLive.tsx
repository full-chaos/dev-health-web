"use client";

import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { RefreshControl } from "@/components/admin/RefreshControl";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { getSyncRunPresentation } from "@/lib/admin/syncRunPresentation";
import { getSyncUnitErrorPresentation } from "@/lib/admin/syncUnitErrorPresentation";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber, formatPercent, formatDateUTC } from "@/lib/formatters";
import { type SyncStatus, isTerminalSyncStatus } from "@/lib/sync-types";
import type { SyncRun, SyncRunUnit, SyncRunUnitQuery, SyncRunUnitSummary } from "@/lib/admin/types";

/** Units shown per page of the unit table (the paged units read asks for this many). */
export const SYNC_RUN_UNIT_PAGE_SIZE = 100;

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

function isProviderCapacityWaitingUnit(unit: SyncRunUnit): boolean {
    return (
        unit.error_category === "provider_budget_contention" ||
        unit.error === "provider_budget_contention"
    );
}

type AttentionDisposition = "failed" | "retrying" | "waiting";

interface AttentionGroup {
    key: string;
    datasetKey: string;
    disposition: AttentionDisposition;
    title: string;
    detail: string | null;
    sourceNames: string[];
    units: SyncRunUnit[];
    retryWindows: Array<{
        availableAt: string;
        sourceNames: string[];
    }>;
    budgetDeferrals: number | null;
}

function attentionDisposition(unit: SyncRunUnit): AttentionDisposition {
    if (isProviderCapacityWaitingUnit(unit) || unit.error_category === "budget_deferred") {
        return "waiting";
    }
    if (unit.status === "failed") return "failed";
    return "retrying";
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
    // CHAOS-4318: no more timer-driven polling against the Python API — the
    // initial (server) fetch populates this on mount, and every subsequent
    // read comes from an explicit Refresh click.
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
        testMode ? null : new Date().toISOString(),
    );
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    // Guard against overlapping refreshes if a click lands while one is in flight.
    const inFlightRef = useRef(false);
    const unitsRequestRef = useRef(0);
    const filtersTouchedRef = useRef(false);

    const runPresentation = getSyncRunPresentation(run, summary);
    const isTerminal = isTerminalSyncStatus(runPresentation.badgeStatus);

    // CHAOS-4318: manual refresh only — fetch run + unit state on demand via
    // the Refresh control instead of a setInterval poll loop.
    const refresh = useCallback(async () => {
        if (inFlightRef.current || testMode) return;
        inFlightRef.current = true;
        setIsRefreshing(true);
        try {
            const [runRes, unitsRes] = await Promise.all([
                getSyncRunStatus(runId),
                getSyncRunUnits(runId, { limit: SYNC_RUN_UNIT_PAGE_SIZE, offset: 0 }),
            ]);

            // withErrorHandling RETURNS { error } (never throws), so a failed
            // fetch arrives as data:undefined. Do NOT apply blindly: surface a
            // non-fatal indicator instead of rendering stale/empty data.
            if (runRes.error || unitsRes.error || !runRes.data || !unitsRes.data) {
                setUnitsError(READ_FAILED_MESSAGE);
                return;
            }

            setSummary(unitsRes.data);
            setUnitsError(null);
            if (filtersTouchedRef.current) {
                setRefreshTick((tick) => tick + 1);
            } else {
                setPageUnits(unitsRes.data.units);
                setFilteredCount(unitsRes.data.filtered_unit_count ?? unitsRes.data.unit_count);
            }
            setRun(runRes.data);
            setLastUpdatedAt(new Date().toISOString());
        } finally {
            inFlightRef.current = false;
            setIsRefreshing(false);
        }
    }, [testMode, runId]);

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

    const { total, completed, failed, settled } = runPresentation.counts;
    const percent = total > 0 ? Math.min(100, Math.round((settled / total) * 100)) : 0;

    const attentionUnits = useMemo(
        () =>
            (summary?.units ?? []).filter(
                (unit) =>
                    unit.status === "failed" ||
                    unit.status === "retrying" ||
                    isProviderCapacityWaitingUnit(unit),
            ),
        [summary],
    );

    const attentionGroups = useMemo<AttentionGroup[]>(() => {
        const groups = new Map<
            string,
            Omit<AttentionGroup, "sourceNames" | "retryWindows" | "budgetDeferrals"> & {
                sourceNames: Set<string>;
            }
        >();

        for (const unit of attentionUnits) {
            const errorPresentation = getSyncUnitErrorPresentation(unit.error, unit.error_category);
            const disposition = attentionDisposition(unit);
            const key = `${unit.dataset_key}:${errorPresentation.code ?? errorPresentation.title}:${disposition}`;
            const existing = groups.get(key);
            if (existing) {
                existing.units.push(unit);
                existing.sourceNames.add(sourceLabel(unit.source_id));
                continue;
            }
            groups.set(key, {
                key,
                datasetKey: unit.dataset_key,
                disposition,
                title: errorPresentation.title,
                detail: errorPresentation.detail,
                sourceNames: new Set([sourceLabel(unit.source_id)]),
                units: [unit],
            });
        }

        return Array.from(groups.values(), (group) => {
            const sourcesByRetryWindow = new Map<string, Set<string>>();
            if (group.disposition !== "failed") {
                for (const unit of group.units) {
                    if (!unit.available_at) continue;
                    const sources =
                        sourcesByRetryWindow.get(unit.available_at) ?? new Set<string>();
                    sources.add(sourceLabel(unit.source_id));
                    sourcesByRetryWindow.set(unit.available_at, sources);
                }
            }

            return {
                ...group,
                sourceNames: Array.from(group.sourceNames).sort(),
                retryWindows: Array.from(sourcesByRetryWindow, ([availableAt, sources]) => ({
                    availableAt,
                    sourceNames: Array.from(sources).sort(),
                })).sort((left, right) => left.availableAt.localeCompare(right.availableAt)),
                budgetDeferrals:
                    group.units.some(isBudgetBlockedUnit) &&
                    group.units.some((unit) => typeof unit.budget_deferrals === "number")
                        ? group.units.reduce(
                              (total, unit) => total + (unit.budget_deferrals ?? 0),
                              0,
                          )
                        : null,
            };
        }).sort((left, right) =>
            `${left.datasetKey}:${left.title}`.localeCompare(`${right.datasetKey}:${right.title}`),
        );
    }, [attentionUnits, sourceLabel]);

    // Unit table filters (CHAOS-2794). In test mode they narrow the sample units
    // client-side. Live, every filter and page change asks the units read for
    // that page (the run can hold far more units than one response carries), and
    // the rollups above keep describing the whole run.
    const [statusFilter, setStatusFilter] = useState("all");
    const [datasetFilter, setDatasetFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [failedOnlyFilter, setFailedOnlyFilter] = useState(false);
    const [sinceFilter, setSinceFilter] = useState("");
    const [beforeFilter, setBeforeFilter] = useState("");
    const [offset, setOffset] = useState(0);
    const [pageUnits, setPageUnits] = useState<SyncRunUnit[]>(initialSummary?.units ?? []);
    const [filteredCount, setFilteredCount] = useState<number | null>(
        initialSummary ? (initialSummary.filtered_unit_count ?? initialSummary.unit_count) : null,
    );
    const [unitsLoading, setUnitsLoading] = useState(false);

    const hasActiveUnitFilters =
        statusFilter !== "all" ||
        datasetFilter !== "all" ||
        sourceFilter !== "all" ||
        failedOnlyFilter ||
        sinceFilter !== "" ||
        beforeFilter !== "";

    const changeFilter =
        <T,>(setter: (value: T) => void) =>
        (value: T) => {
            filtersTouchedRef.current = true;
            setOffset(0);
            setter(value);
        };

    const availableStatuses = useMemo(() => {
        const present = new Set(
            testMode
                ? (summary?.units ?? []).map((unit) => unit.status)
                : Object.keys(summary?.by_status ?? {}),
        );
        if (!testMode && !summary) return [...STATUS_FILTER_ORDER];
        return STATUS_FILTER_ORDER.filter((status) => present.has(status));
    }, [summary, testMode]);

    const availableDatasets = useMemo(
        () =>
            Array.from(
                new Set(
                    testMode
                        ? (summary?.units ?? []).map((unit) => unit.dataset_key)
                        : Object.keys(summary?.by_dataset ?? {}),
                ),
            ).sort(),
        [summary, testMode],
    );

    const availableSourceIds = useMemo(
        () =>
            Array.from(
                new Set(
                    testMode
                        ? (summary?.units ?? []).map((unit) => unit.source_id)
                        : Object.keys(summary?.by_source ?? {}),
                ),
            ),
        [summary, testMode],
    );

    // The unit-read query for the current filters and page, or null when the
    // filters cannot match any unit (an explicit status that is not failed or
    // retrying together with "Failed/retrying only").
    const unitQuery = useMemo<SyncRunUnitQuery | null>(() => {
        let status: string | undefined;
        if (failedOnlyFilter) {
            if (statusFilter === "all") status = "failed,retrying";
            else if (statusFilter === "failed" || statusFilter === "retrying")
                status = statusFilter;
            else return null;
        } else if (statusFilter !== "all") {
            status = statusFilter;
        }
        return {
            limit: SYNC_RUN_UNIT_PAGE_SIZE,
            offset,
            status,
            dataset_key: datasetFilter !== "all" ? datasetFilter : undefined,
            source_id: sourceFilter !== "all" ? sourceFilter : undefined,
            since: sinceFilter ? `${sinceFilter}T00:00:00.000Z` : undefined,
            before: beforeFilter ? `${beforeFilter}T23:59:59.999Z` : undefined,
        };
    }, [
        statusFilter,
        datasetFilter,
        sourceFilter,
        failedOnlyFilter,
        sinceFilter,
        beforeFilter,
        offset,
    ]);

    const loadUnits = useCallback(
        async (query: SyncRunUnitQuery | null) => {
            const requestId = ++unitsRequestRef.current;
            if (query === null) {
                setPageUnits([]);
                setFilteredCount(0);
                setUnitsError(null);
                setUnitsLoading(false);
                return;
            }
            setUnitsLoading(true);
            const result = await getSyncRunUnits(runId, query);
            if (requestId !== unitsRequestRef.current) return;
            setUnitsLoading(false);
            if (result.error || !result.data) {
                setUnitsError(READ_FAILED_MESSAGE);
                return;
            }
            setUnitsError(null);
            setPageUnits(result.data.units);
            setFilteredCount(result.data.filtered_unit_count ?? result.data.unit_count);
            setSummary((current) => current ?? result.data ?? null);
        },
        [runId],
    );

    useEffect(() => {
        if (testMode || !filtersTouchedRef.current) return;
        void loadUnits(unitQuery);
    }, [testMode, unitQuery, loadUnits, refreshTick]);

    const goToOffset = (nextOffset: number) => {
        filtersTouchedRef.current = true;
        setOffset(Math.max(0, nextOffset));
    };

    const retryUnits = useCallback(() => {
        void loadUnits(unitQuery);
    }, [loadUnits, unitQuery]);

    const filteredUnits = useMemo(() => {
        if (!testMode) return pageUnits;
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
        testMode,
        pageUnits,
        summary,
        statusFilter,
        datasetFilter,
        sourceFilter,
        failedOnlyFilter,
        sinceFilter,
        beforeFilter,
    ]);

    const shownCount = testMode ? filteredUnits.length : filteredCount;
    const totalUnits = summary?.unit_count ?? null;

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
                            <SyncStatusBadge
                                status={runPresentation.badgeStatus}
                                label={runPresentation.label}
                                className="text-sm px-3 py-1"
                            />
                            <span
                                className="text-sm text-(--ink-muted)"
                                role="status"
                                aria-live="polite"
                            >
                                {isTerminal
                                    ? "Run complete"
                                    : unitsError
                                      ? "Live updates unavailable"
                                      : "Not auto-refreshing — use Refresh for the latest state"}
                            </span>
                        </div>
                        {runPresentation.description && (
                            <p className="text-sm text-(--ink-muted)">
                                {runPresentation.description}
                            </p>
                        )}
                        {!isTerminal && !testMode && (
                            <RefreshControl
                                onRefresh={refresh}
                                lastUpdatedAt={lastUpdatedAt}
                                isRefreshing={isRefreshing}
                            />
                        )}
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Status
                                </dt>
                                <dd className="text-foreground">{runPresentation.label}</dd>
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
                    <h3 className="text-sm font-medium text-(--negative) uppercase tracking-wider">
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
                    {attentionGroups.length > 0 && (
                        <section
                            aria-labelledby="needs-attention-heading"
                            className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                        >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h3
                                    id="needs-attention-heading"
                                    className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider"
                                >
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
                                {attentionGroups.map((group) => (
                                    <li
                                        key={group.key}
                                        className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 text-sm"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-xs text-(--ink-muted)">
                                                    {group.datasetKey}
                                                </p>
                                                <h4 className="font-medium text-foreground">
                                                    {group.title}
                                                </h4>
                                            </div>
                                            <SyncStatusBadge
                                                status={
                                                    group.disposition === "failed"
                                                        ? "failed"
                                                        : "running"
                                                }
                                                label={group.disposition}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-(--ink-muted)">
                                            {formatNumber(group.units.length)} {group.disposition}{" "}
                                            unit{group.units.length === 1 ? "" : "s"} ·{" "}
                                            {formatNumber(group.sourceNames.length)} source
                                            {group.sourceNames.length === 1 ? "" : "s"}
                                        </p>
                                        <p className="mt-1 text-xs text-(--ink-muted)">
                                            {group.sourceNames.join(", ")}
                                        </p>
                                        {group.detail && (
                                            <p className="mt-1 text-xs text-(--ink-muted)">
                                                {group.detail}
                                            </p>
                                        )}
                                        {group.budgetDeferrals !== null && (
                                            <p className="mt-1 text-xs text-(--ink-muted)">
                                                {formatNumber(group.budgetDeferrals)} deferral
                                                {group.budgetDeferrals === 1 ? "" : "s"}
                                            </p>
                                        )}
                                        {group.retryWindows.length > 0 && (
                                            <ul
                                                aria-label={`${group.title} retry schedule`}
                                                className="mt-1 space-y-1 text-xs text-(--ink-muted)"
                                            >
                                                {group.retryWindows.map((retryWindow) => (
                                                    <li key={retryWindow.availableAt}>
                                                        <span>
                                                            {group.disposition === "waiting"
                                                                ? "Next attempt"
                                                                : "Retry at"}{" "}
                                                            <ClientTimestamp
                                                                value={retryWindow.availableAt}
                                                                fallback="—"
                                                            />{" "}
                                                            · {retryWindow.sourceNames.join(", ")}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            ) : null}

            {/* Unit table */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                    {shownCount === null
                        ? "Units"
                        : `Units (${formatNumber(shownCount)}${
                              hasActiveUnitFilters && totalUnits !== null
                                  ? ` of ${formatNumber(totalUnits)}`
                                  : ""
                          })`}
                </h3>

                {/* Filters (CHAOS-2794) narrow the table below only; the persisted
                    rollups (Unit status / By dataset / By source / By cost class)
                    above always reflect the full run. The bar renders even when
                    the units read failed, so a failed read never looks like a
                    lost filter. */}
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                        Status
                        <select
                            value={statusFilter}
                            onChange={(event) => changeFilter(setStatusFilter)(event.target.value)}
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
                            onChange={(event) => changeFilter(setDatasetFilter)(event.target.value)}
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
                            onChange={(event) => changeFilter(setSourceFilter)(event.target.value)}
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
                            onChange={(event) => changeFilter(setSinceFilter)(event.target.value)}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-(--ink-muted)">
                        Before
                        <input
                            type="date"
                            value={beforeFilter}
                            onChange={(event) => changeFilter(setBeforeFilter)(event.target.value)}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-sm text-foreground"
                        />
                    </label>
                    <label className="flex items-center gap-2 pb-1.5 text-sm text-(--ink-muted)">
                        <input
                            type="checkbox"
                            checked={failedOnlyFilter}
                            onChange={(event) =>
                                changeFilter(setFailedOnlyFilter)(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-(--card-stroke)"
                        />
                        Failed/retrying only
                    </label>
                </div>
                {unitsError ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-(--card-stroke) bg-(--card-80) p-4"
                    >
                        <p className="text-sm text-(--ink-muted)">
                            Failed to load units: {unitsError}
                        </p>
                        {!testMode && (
                            <button
                                type="button"
                                onClick={retryUnits}
                                disabled={unitsLoading}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-sm text-foreground hover:bg-(--card-80) disabled:opacity-60"
                            >
                                {CTA_LABELS.retry}
                            </button>
                        )}
                    </div>
                ) : (
                    <div
                        className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)"
                        aria-busy={unitsLoading}
                    >
                        <table className="min-w-full divide-y divide-(--card-stroke)">
                            <thead className="bg-(--surface-raised)">
                                <tr>
                                    {[
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
                                {filteredUnits.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={9}
                                            className="px-4 py-6 text-center text-sm text-(--ink-muted)"
                                        >
                                            {unitsLoading
                                                ? "Loading units…"
                                                : "No units match these filters."}
                                        </td>
                                    </tr>
                                )}
                                {filteredUnits.map((unit: SyncRunUnit) => {
                                    const errorPresentation = getSyncUnitErrorPresentation(
                                        unit.error,
                                        unit.error_category,
                                    );
                                    return (
                                        <tr key={unit.id}>
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
                                                ) : isProviderCapacityWaitingUnit(unit) ? (
                                                    <BudgetGuardBadge
                                                        tone="blocked"
                                                        label="Waiting: provider capacity"
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
                                                {unit.error || unit.error_category ? (
                                                    <span
                                                        className={
                                                            unit.status === "failed"
                                                                ? "text-(--negative)"
                                                                : "text-(--ink-muted)"
                                                        }
                                                        title={
                                                            errorPresentation.detail ?? undefined
                                                        }
                                                    >
                                                        {errorPresentation.title}
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
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {!testMode &&
                    !unitsError &&
                    shownCount !== null &&
                    shownCount > SYNC_RUN_UNIT_PAGE_SIZE && (
                        <div className="flex items-center justify-between text-sm text-(--ink-muted)">
                            <span>
                                Showing {formatNumber(offset + 1)}–
                                {formatNumber(
                                    Math.min(offset + SYNC_RUN_UNIT_PAGE_SIZE, shownCount),
                                )}{" "}
                                of {formatNumber(shownCount)}
                            </span>
                            <span className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => goToOffset(offset - SYNC_RUN_UNIT_PAGE_SIZE)}
                                    disabled={offset === 0 || unitsLoading}
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-foreground disabled:opacity-60"
                                >
                                    {CTA_LABELS.previousPage}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goToOffset(offset + SYNC_RUN_UNIT_PAGE_SIZE)}
                                    disabled={
                                        offset + SYNC_RUN_UNIT_PAGE_SIZE >= shownCount ||
                                        unitsLoading
                                    }
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-foreground disabled:opacity-60"
                                >
                                    {CTA_LABELS.nextPage}
                                </button>
                            </span>
                        </div>
                    )}
            </div>
        </div>
    );
}
