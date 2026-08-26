"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncRun, SyncRunUnitSummary } from "@/lib/admin/types";
import { getSyncJobs, getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { getSyncRunPresentation } from "@/lib/admin/syncRunPresentation";
import { isTerminalSyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";
import { RefreshControl } from "@/components/admin/RefreshControl";
import type { SyncJob } from "@/lib/admin/types";

/**
 * Config-scoped sync progress (CHAOS-2799, timers removed CHAOS-4318).
 *
 * Replaces the previous org+provider-scoped GraphQL subscription — which the
 * backend publisher never wires into unitized/planner workers (CHAOS-2703),
 * and which conflated concurrent same-provider configs since it only
 * filtered by `provider`, never `configId` — with a single on-demand read
 * over PERSISTED run state:
 *
 *   1. Discovery: check the config's recent jobs (GET /sync-configs/{id}/jobs)
 *      for a planner-backed job that is still running/pending. This surfaces
 *      manual, scheduled, AND backfill-triggered runs uniformly, with no
 *      direct hookup to SyncNowButton/useSyncTrigger required.
 *   2. Tracking: once a `sync_run_id` is known, read GET /sync-runs/{id}.
 *
 * CHAOS-4318: the Python API replicas are a scarce resource, so this no
 * longer re-runs on a timer. It checks once on mount (and whenever
 * `configId` changes) and otherwise only on an explicit Refresh click —
 * see the "Why now" note on CHAOS-4318 in the ticket.
 *
 * All state is component-local (no module-level cache), so two
 * `<SyncProgressBar configId=".."/>` instances — e.g. two concurrent
 * same-provider configs — never share or leak progress.
 */

/** How long to keep showing a terminal result before clearing it. */
const TERMINAL_DISPLAY_MS = 5000;
/** How many recent jobs to inspect when looking for an active run.
 *
 * 25 (not just a handful) so a burst of newer terminal jobs never hides an
 * older still-running one further back in descending-recency order. The
 * enriched `/jobs` endpoint honors `limit` server-side, so this is a single
 * cheap request.
 */
const DISCOVERY_JOB_LIMIT = 25;
interface SyncProgressBarProps {
    configId: string;
    /** When true, never fetch a live API (Playwright/test-mode sample rendering). */
    testMode?: boolean;
}

function formatElapsed(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function hasActiveSyncRun(job: SyncJob): boolean {
    if (!job.sync_run?.sync_run_id) return false;
    if (job.status !== "running" && job.status !== "pending") return false;
    const totalUnits = job.sync_run.total_units;
    const settledUnits = job.sync_run.completed_units + job.sync_run.failed_units;
    return totalUnits === 0 || settledUnits < totalUnits;
}

export function SyncProgressBar({ configId, testMode = false }: SyncProgressBarProps) {
    const [tracked, setTracked] = useState<{
        configId: string;
        run: SyncRun;
        summary: SyncRunUnitSummary | null;
    } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [terminalUntil, setTerminalUntil] = useState<number | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const inFlightRef = useRef(false);
    // Invalidates any in-flight response once a newer check starts (configId
    // change, a fresh Refresh click, or unmount) so a slow discovery/tracking
    // call can never mutate state for a config/check this instance has moved
    // away from.
    const seqRef = useRef(0);

    // Single discovery + tracking read, run on mount/configId-change and
    // again only when the caller explicitly asks (Refresh click).
    const check = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        seqRef.current += 1;
        const mySeq = seqRef.current;
        setIsRefreshing(true);
        try {
            const jobsRes = await getSyncJobs(configId, DISCOVERY_JOB_LIMIT);
            if (mySeq !== seqRef.current) return;
            if (jobsRes.error || !jobsRes.data) {
                setLastUpdatedAt(new Date().toISOString());
                return;
            }
            const activeJob = jobsRes.data.find(hasActiveSyncRun);
            if (!activeJob?.sync_run) {
                setTracked((current) =>
                    current && current.configId === configId ? null : current,
                );
                setLastUpdatedAt(new Date().toISOString());
                return;
            }

            const runId = activeJob.sync_run.sync_run_id;
            const [runRes, unitsRes] = await Promise.all([
                getSyncRunStatus(runId),
                getSyncRunUnits(runId),
            ]);
            if (mySeq !== seqRef.current) return;
            if (runRes.error || !runRes.data) {
                setLastUpdatedAt(new Date().toISOString());
                return;
            }
            const summary = unitsRes.error ? null : (unitsRes.data ?? null);

            // Pair the run with the configId this check was made for (not
            // just the current prop) so a later configId change can never
            // keep rendering a stale config's run — render gates on
            // `tracked.configId === configId` below.
            setTracked({ configId, run: runRes.data, summary });
            setLastUpdatedAt(new Date().toISOString());

            const liveStatus = getSyncRunPresentation(runRes.data, summary).badgeStatus;
            setTerminalUntil(
                isTerminalSyncStatus(liveStatus) ? Date.now() + TERMINAL_DISPLAY_MS : null,
            );
        } finally {
            inFlightRef.current = false;
            setIsRefreshing(false);
        }
    }, [configId]);

    // Reset tracking state synchronously during render when `configId`
    // changes (the documented React pattern for resetting state from
    // props — mirrors BackfillStatus's `backfillJobSyncKey` — so
    // `react-hooks/set-state-in-effect` stays satisfied and switching
    // configs never renders a stale config's run even for one frame).
    const [syncedConfigId, setSyncedConfigId] = useState(configId);
    if (configId !== syncedConfigId) {
        setSyncedConfigId(configId);
        setTracked(null);
        setTerminalUntil(null);
    }

    // Fetch once on mount / whenever configId changes. Re-runs whenever
    // `configId` changes — so switching configs (or two sibling instances
    // with different configIds) never share state.
    useEffect(() => {
        if (testMode) return undefined;
        seqRef.current += 1;
        void check();
        return () => {
            seqRef.current += 1;
        };
    }, [configId, testMode, check]);

    // Only ever visible when the tracked run's configId still matches the
    // current prop — closes the stale-config leak: if `configId` changes
    // before this instance's tracking state is cleared/overwritten, the OLD
    // config's run immediately stops rendering (CHAOS-2799).
    const visibleTracked = tracked && tracked.configId === configId ? tracked : null;
    const visibleRun = visibleTracked?.run ?? null;
    const visibleSummary = visibleTracked?.summary ?? null;
    const runStatus = visibleRun?.status ?? null;
    const runStartedAt = visibleRun?.started_at ?? null;
    const visiblePresentation = visibleRun
        ? getSyncRunPresentation(visibleRun, visibleSummary)
        : null;

    // 1s display timer while a run is actively tracked, purely for the
    // elapsed-time readout — a local clock tick, never a fetch. Derives from
    // persisted `started_at` rather than a client-observed timestamp, per
    // the render-persisted-state contract.
    useEffect(() => {
        if (
            !runStartedAt ||
            isTerminalSyncStatus(
                visiblePresentation?.badgeStatus ?? mapPlannerRunStatus(runStatus ?? ""),
            )
        ) {
            return undefined;
        }
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [runStatus, runStartedAt, visiblePresentation?.badgeStatus]);

    // Auto-clear a terminal result after a short grace period so the bar
    // doesn't linger indefinitely once a run finishes. No fetch involved.
    useEffect(() => {
        if (terminalUntil === null) return undefined;
        const delay = Math.max(0, terminalUntil - Date.now());
        const timer = setTimeout(() => {
            // Functional update guarded by configId: never clear a NEWER
            // config's tracked run if this timer was scheduled by an older
            // config's now-stale terminal result.
            setTracked((current) => (current && current.configId === configId ? null : current));
        }, delay);
        return () => clearTimeout(timer);
    }, [terminalUntil, configId]);

    if (!visibleRun) return null;

    const run = visibleRun;

    const presentation = visiblePresentation ?? getSyncRunPresentation(run, visibleSummary);
    const liveStatus = presentation.badgeStatus;
    const { total: totalUnits, settled } = presentation.counts;
    const percentage = totalUnits > 0 ? Math.min(100, Math.round((settled / totalUnits) * 100)) : 0;
    const elapsedSeconds = run.started_at
        ? Math.max(0, Math.floor((now - new Date(run.started_at).getTime()) / 1000))
        : 0;

    const hasEtaData = settled >= 2 && elapsedSeconds > 0 && totalUnits > settled;
    const estimatedSecondsRemaining = hasEtaData
        ? Math.max(0, Math.round((totalUnits - settled) * (elapsedSeconds / settled)))
        : null;
    const etaText =
        estimatedSecondsRemaining === null
            ? "Calculating..."
            : `~${Math.floor(estimatedSecondsRemaining / 60)}m ${estimatedSecondsRemaining % 60}s remaining`;

    return (
        <div
            className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
            role="status"
            aria-live="polite"
        >
            <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{presentation.progressLabel}</span>
                <span className="text-(--ink-muted)">
                    {settled} / {totalUnits} ({percentage}%)
                </span>
            </div>

            <div
                className="h-2 w-full overflow-hidden rounded-full bg-(--card-70)"
                role="progressbar"
                aria-label="Sync progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-valuetext={`${settled} of ${totalUnits} units settled`}
            >
                <div
                    className="h-full bg-(--accent) transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-(--ink-muted)">
                <span>
                    Elapsed {formatElapsed(elapsedSeconds)} - {percentage}% complete
                </span>
                <span>{liveStatus === "running" ? etaText : ""}</span>
            </div>
            {!testMode && (
                <div className="mt-3">
                    <RefreshControl
                        onRefresh={check}
                        lastUpdatedAt={lastUpdatedAt}
                        isRefreshing={isRefreshing}
                    />
                </div>
            )}
        </div>
    );
}
