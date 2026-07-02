"use client";

import { useEffect, useRef, useState } from "react";
import { getSyncJobs, getSyncRunStatus } from "@/lib/admin/server";
import { isTerminalSyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";
import type { SyncRun } from "@/lib/admin/types";

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
/** How many recent jobs to inspect when looking for an active run. */
const DISCOVERY_JOB_LIMIT = 5;

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

export function SyncProgressBar({ configId, testMode = false }: SyncProgressBarProps) {
    const [run, setRun] = useState<SyncRun | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [terminalUntil, setTerminalUntil] = useState<number | null>(null);

    // The sync_run_id currently being tracked for THIS config instance. A ref
    // (not state) because it only drives poll branching inside the interval
    // callback, never rendering directly.
    const runIdRef = useRef<string | null>(null);
    const trackStartedAtRef = useRef<number | null>(null);
    const inFlightRef = useRef(false);
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

        const tick = async () => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            try {
                if (!runIdRef.current) {
                    const jobsRes = await getSyncJobs(configId, DISCOVERY_JOB_LIMIT);
                    if (effectSeq !== seqRef.current) return;
                    if (jobsRes.error || !jobsRes.data) return;
                    const activeJob = jobsRes.data.find(
                        (job) =>
                            job.sync_run?.sync_run_id &&
                            (job.status === "running" || job.status === "pending"),
                    );
                    if (!activeJob?.sync_run) return;
                    runIdRef.current = activeJob.sync_run.sync_run_id;
                    trackStartedAtRef.current = Date.now();
                }

                const runId = runIdRef.current;
                if (!runId) return;

                const runRes = await getSyncRunStatus(runId);
                // Ignore stale responses: a newer effect run (configId
                // changed) or a since-cleared tracked run must never apply.
                if (effectSeq !== seqRef.current || runIdRef.current !== runId) return;
                if (runRes.error || !runRes.data) return;

                setRun(runRes.data);
                setTerminalUntil(null);

                const liveStatus = mapPlannerRunStatus(runRes.data.status);
                const trackedTooLong =
                    trackStartedAtRef.current !== null &&
                    Date.now() - trackStartedAtRef.current > MAX_TRACK_DURATION_MS;

                if (isTerminalSyncStatus(liveStatus)) {
                    runIdRef.current = null;
                    trackStartedAtRef.current = null;
                    setTerminalUntil(Date.now() + TERMINAL_DISPLAY_MS);
                } else if (trackedTooLong) {
                    // Give up tracking a stuck run so the bar doesn't spin on
                    // it forever; fall back to discovery.
                    runIdRef.current = null;
                    trackStartedAtRef.current = null;
                    setRun(null);
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

    const runStatus = run?.status ?? null;
    const runStartedAt = run?.started_at ?? null;

    // 1s display timer while a run is actively tracked, purely for the
    // elapsed-time readout. Derives from persisted `started_at` rather than a
    // client-observed timestamp, per the render-persisted-state contract.
    useEffect(() => {
        if (!runStartedAt || isTerminalSyncStatus(mapPlannerRunStatus(runStatus ?? ""))) {
            return undefined;
        }
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [runStatus, runStartedAt]);

    // Auto-clear a terminal result after a short grace period so the bar
    // doesn't linger indefinitely once a run finishes.
    useEffect(() => {
        if (terminalUntil === null) return undefined;
        const delay = Math.max(0, terminalUntil - Date.now());
        const timer = setTimeout(() => setRun(null), delay);
        return () => clearTimeout(timer);
    }, [terminalUntil]);

    if (!run) return null;

    const liveStatus = mapPlannerRunStatus(run.status);
    const settled = Math.min(run.total_units, run.completed_units + run.failed_units);
    const percentage =
        run.total_units > 0 ? Math.min(100, Math.round((settled / run.total_units) * 100)) : 0;
    const elapsedSeconds = run.started_at
        ? Math.max(0, Math.floor((now - new Date(run.started_at).getTime()) / 1000))
        : 0;

    const hasEtaData = settled >= 2 && elapsedSeconds > 0 && run.total_units > settled;
    const estimatedSecondsRemaining = hasEtaData
        ? Math.max(0, Math.round((run.total_units - settled) * (elapsedSeconds / settled)))
        : null;
    const etaText =
        estimatedSecondsRemaining === null
            ? "Calculating..."
            : `~${Math.floor(estimatedSecondsRemaining / 60)}m ${estimatedSecondsRemaining % 60}s remaining`;

    const statusLabel =
        liveStatus === "running" ? "Syncing..." : liveStatus === "success" ? "Sync completed" : "Sync failed";

    return (
        <div
            className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
            role="status"
            aria-live="polite"
        >
            <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{statusLabel}</span>
                <span className="text-(--ink-muted)">
                    {settled} / {run.total_units} ({percentage}%)
                </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-70)">
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
        </div>
    );
}
