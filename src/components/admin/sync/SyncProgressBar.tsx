"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncRun, SyncRunUnitSummary } from "@/lib/admin/types";
import { getSyncJobs, getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { getSyncRunPresentation } from "@/lib/admin/syncRunPresentation";
import { isTerminalSyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";
import type { SyncJob } from "@/lib/admin/types";

/**
 * Config-scoped live sync progress (CHAOS-2799).
 *
 * Replaces the previous org+provider-scoped GraphQL subscription — which the
 * backend publisher never wires into unitized/planner workers (CHAOS-2703),
 * and which conflated concurrent same-provider configs since it only
 * filtered by `provider`, never `configId` — with polling over PERSISTED
 * run state:
 *
 *   1. Discovery: while no run is being tracked, poll the config's recent
 *      jobs (GET /sync-configs/{id}/jobs) for a planner-backed job that is
 *      still running/pending. This surfaces manual, scheduled, AND
 *      backfill-triggered runs uniformly, with no direct hookup to
 *      SyncNowButton/useSyncTrigger required.
 *   2. Tracking: once a `sync_run_id` is known, poll GET /sync-runs/{id}
 *      directly until the run reaches a terminal status, then drop back to
 *      discovery so a later scheduled run is picked up too.
 *
 * All state is component-local (no module-level cache), so two
 * `<SyncProgressBar configId=".."/>` instances — e.g. two concurrent
 * same-provider configs — never share or leak progress.
 */

/** How often to check for an active run, or refresh the tracked run's state. */
const POLL_INTERVAL_MS = 3500;
/** How long to keep showing a terminal result before clearing it. */
const TERMINAL_DISPLAY_MS = 5000;
/** Safety cap so a stuck/abandoned run never pins the bar in "running" forever. */
const MAX_TRACK_DURATION_MS = 10 * 60 * 1000;
/** How many recent jobs to inspect when looking for an active run.
 *
 * 25 (not just a handful) so a burst of newer terminal jobs never hides an
 * older still-running one further back in descending-recency order. The
 * enriched `/jobs` endpoint honors `limit` server-side, so this is a single
 * cheap request — a paging loop would be overkill for a 3.5s poll cadence.
 */
const DISCOVERY_JOB_LIMIT = 25;
interface SyncProgressBarProps {
    configId: string;
    /** When true, never poll a live API (Playwright/test-mode sample rendering). */
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
    const [pollingPaused, setPollingPaused] = useState(false);

    // The sync_run_id currently being tracked for THIS config instance. A ref
    // (not state) because it only drives poll branching inside the interval
    // callback, never rendering directly.
    const runIdRef = useRef<string | null>(null);
    const trackStartedAtRef = useRef<number | null>(null);
    const trackingPausedRef = useRef(false);
    const inFlightRef = useRef(false);
    const lastSummaryByRunRef = useRef<Record<string, SyncRunUnitSummary>>({});
    // Invalidates any in-flight response once the effect tears down (configId
    // change or unmount) so a slow discovery/tracking call can never mutate
    // state for a config this instance has moved away from.
    const seqRef = useRef(0);

    // Discover + poll. Re-runs whenever `configId` changes, tearing down the
    // previous interval and resetting tracking refs — so switching configs
    // (or two sibling instances with different configIds) never share state.
    useEffect(() => {
        if (testMode) return undefined;

        seqRef.current += 1;
        const effectSeq = seqRef.current;
        runIdRef.current = null;
        trackStartedAtRef.current = null;
        trackingPausedRef.current = false;

        const tick = async () => {
            if (inFlightRef.current || trackingPausedRef.current) return;
            inFlightRef.current = true;
            try {
                if (!runIdRef.current) {
                    const jobsRes = await getSyncJobs(configId, DISCOVERY_JOB_LIMIT);
                    if (effectSeq !== seqRef.current) return;
                    if (jobsRes.error || !jobsRes.data) return;
                    const activeJob = jobsRes.data.find(hasActiveSyncRun);
                    if (!activeJob?.sync_run) return;
                    runIdRef.current = activeJob.sync_run.sync_run_id;
                    trackStartedAtRef.current = Date.now();
                    setPollingPaused(false);
                }

                const runId = runIdRef.current;
                if (!runId) return;

                const [runRes, unitsRes] = await Promise.all([
                    getSyncRunStatus(runId),
                    getSyncRunUnits(runId),
                ]);
                // Ignore stale responses: a newer effect run (configId
                // changed) or a since-cleared tracked run must never apply.
                if (effectSeq !== seqRef.current || runIdRef.current !== runId) return;
                if (runRes.error || !runRes.data) return;
                const summary = unitsRes.error
                    ? (lastSummaryByRunRef.current[runId] ?? null)
                    : (unitsRes.data ?? null);
                if (summary) lastSummaryByRunRef.current[runId] = summary;

                // Pair the run with the configId this tick was discovered
                // for (not just the current prop) so a later configId change
                // can never keep rendering a stale config's run — render
                // gates on `tracked.configId === configId` below.
                setTracked({ configId, run: runRes.data, summary });
                setTerminalUntil(null);

                const liveStatus = getSyncRunPresentation(runRes.data, summary).badgeStatus;
                const trackedTooLong =
                    trackStartedAtRef.current !== null &&
                    Date.now() - trackStartedAtRef.current > MAX_TRACK_DURATION_MS;

                if (isTerminalSyncStatus(liveStatus)) {
                    runIdRef.current = null;
                    trackStartedAtRef.current = null;
                    setPollingPaused(false);
                    setTerminalUntil(Date.now() + TERMINAL_DISPLAY_MS);
                } else if (trackedTooLong) {
                    // Keep the last persisted snapshot visible and say exactly
                    // what stopped. Rediscovering the same active row would
                    // silently restart the 10-minute clock and look live forever.
                    trackingPausedRef.current = true;
                    runIdRef.current = null;
                    trackStartedAtRef.current = null;
                    setPollingPaused(true);
                }
            } finally {
                inFlightRef.current = false;
            }
        };

        const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
        void tick();

        return () => {
            seqRef.current += 1;
            clearInterval(interval);
        };
    }, [configId, testMode]);

    // Only ever visible when the tracked run's configId still matches the
    // current prop — closes the stale-config leak: if `configId` changes
    // before this instance's tracking state is cleared/overwritten, the OLD
    // config's run immediately stops rendering rather than persisting until
    // the next terminal/cleanup tick (CHAOS-2799).
    const visibleTracked = tracked && tracked.configId === configId ? tracked : null;
    const visibleRun = visibleTracked?.run ?? null;
    const visibleSummary = visibleTracked?.summary ?? null;
    const runStatus = visibleRun?.status ?? null;
    const runStartedAt = visibleRun?.started_at ?? null;
    const visiblePresentation = visibleRun
        ? getSyncRunPresentation(visibleRun, visibleSummary)
        : null;

    // 1s display timer while a run is actively tracked, purely for the
    // elapsed-time readout. Derives from persisted `started_at` rather than a
    // client-observed timestamp, per the render-persisted-state contract.
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
    // doesn't linger indefinitely once a run finishes.
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
                <span className="font-medium text-foreground">
                    {pollingPaused ? "Sync updates paused" : presentation.progressLabel}
                </span>
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
            {pollingPaused && (
                <p className="mt-2 text-xs text-(--ink-muted)">
                    Automatic updates paused after 10 minutes. Refresh to resume.
                </p>
            )}
        </div>
    );
}
