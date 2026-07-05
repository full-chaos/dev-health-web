"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getBackfillJobStatus } from "@/lib/admin/server";
import { formatDateUTC } from "@/lib/formatters";
import type { BackfillJob } from "@/lib/admin/types";

/** How often to poll for live backfill status. */
const POLL_INTERVAL_MS = 3000;
/**
 * Terminal BackfillJob statuses across both backend paths: the legacy
 * per-chunk path (`completed` | `failed`) and the planner fanout path
 * (`success` | `partial_failed` | `failed`), whose lifecycle is `planned` ->
 * `dispatching` -> `running` -> `success` | `partial_failed` | `failed`
 * (mirrors ops routers/sync.py, sync/planner.py, models/integrations.py).
 */
const TERMINAL_STATUSES = new Set(["completed", "failed", "success", "partial_failed"]);

/**
 * Bounded liveness window (CHAOS-2868): mirrors SyncRunDetailLive's
 * MAX_POLL_DURATION_MS safety cap. A live job reports forward progress
 * within minutes; one still pinned at 0% after this long is presumed a
 * stranded zombie, so polling gives up instead of claiming "Live" forever.
 */
const MAX_ZERO_PROGRESS_POLL_MS = 10 * 60 * 1000;

interface BackfillStatusProps {
    /**
     * Backfill job resolved server-side from PERSISTED state (live
     * `getActiveBackfillJob` fetch, or a test-mode sample) — never derived
     * client-side, so an in-progress backfill survives navigation (CHAOS-2795).
     * The parent renders this with `key={initialJob?.id ?? "none"}` so a
     * newly-submitted job resets local poll state on mount; local state also
     * re-syncs from this prop directly (see `backfillJobSyncKey` below) as
     * defense in depth for a status change on the SAME job id (CHAOS-2868).
     */
    initialJob: BackfillJob | null;
    /** When true, render the provided sample job and never poll a live API. */
    testMode?: boolean;
}

/** Human-readable in-progress/terminal label for every status in both status families. */
function statusLabel(job: BackfillJob): string {
    switch (job.status) {
        case "pending":
        case "planned":
            return "Waiting to start...";
        case "dispatching":
            return "Dispatching work...";
        case "running":
            return `Processing chunk ${job.completed_chunks} of ${job.total_chunks}`;
        case "completed":
        case "success":
            return "Backfill complete";
        case "partial_failed":
            return job.error_message || "Completed with failures";
        case "failed":
            return job.error_message || "Backfill failed";
        default:
            return job.status;
    }
}

/** Progress-bar fill color for every status in both status families. */
function progressBarClassName(status: string): string {
    if (status === "failed") return "bg-(--negative)";
    if (status === "completed" || status === "success") return "bg-(--positive)";
    if (status === "partial_failed") return "bg-(--caution)";
    return "bg-(--accent)";
}

/** Resync key: local state re-syncs whenever the job identity OR its status changes. */
function backfillJobSyncKey(job: BackfillJob | null): string {
    return job ? `${job.id}:${job.status}` : "none";
}

export function BackfillStatus({ initialJob, testMode = false }: BackfillStatusProps) {
    const [job, setJob] = useState<BackfillJob | null>(initialJob);
    const [pollStalled, setPollStalled] = useState(false);
    // Defense in depth (CHAOS-2868): re-sync local state whenever the parent
    // passes a job with a new id OR a new status, even if BackfillOperations'
    // `key={activeBackfillJob?.id}` doesn't remount this component (e.g. a
    // status-only change on the same job id). Adjusting state during render
    // rather than inside an effect mirrors the documented React pattern for
    // resetting state from props and keeps `react-hooks/set-state-in-effect`
    // satisfied.
    const [syncedJobKey, setSyncedJobKey] = useState(() => backfillJobSyncKey(initialJob));
    const initialJobKey = backfillJobSyncKey(initialJob);
    if (initialJobKey !== syncedJobKey) {
        setSyncedJobKey(initialJobKey);
        setJob(initialJob);
        setPollStalled(false);
    }

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    // Poll persisted job status while non-terminal. State is only mutated
    // inside the async interval callback, never synchronously in the effect
    // body (mirrors SyncRunDetailLive / useSyncTrigger discipline), and this
    // effect keys off the INITIAL props (fixed at mount via the parent's
    // `key`) rather than the ever-changing local `job` state.
    useEffect(() => {
        if (testMode) return undefined;
        if (!initialJob || TERMINAL_STATUSES.has(initialJob.status)) return undefined;

        let cancelled = false;
        // Skip overlapping ticks: only one request in flight at a time, so a
        // slow response can never resolve AFTER a later tick's response
        // already reached a terminal/stalled conclusion and overwrite it
        // (out-of-order poll race — mirrors SyncRunDetailLive's inFlightRef).
        let inFlight = false;
        const jobId = initialJob.id;
        const pollStartedAt = Date.now();

        const tick = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const result = await getBackfillJobStatus(jobId);
                if (cancelled) return;
                if (result.error || !result.data) {
                    stopPolling();
                    return;
                }
                setJob(result.data);
                if (TERMINAL_STATUSES.has(result.data.status)) {
                    stopPolling();
                    setPollStalled(false);
                    if (result.data.status === "completed" || result.data.status === "success") {
                        toast.success("Backfill completed successfully");
                    } else if (result.data.status === "partial_failed") {
                        toast.warning(
                            result.data.error_message || "Backfill completed with some failures",
                        );
                    } else {
                        toast.error(result.data.error_message || "Backfill failed");
                    }
                    return;
                }
                if (result.data.progress_pct > 0) {
                    // Real forward progress: never leave a stale "paused"
                    // label behind from an earlier zero-progress window.
                    setPollStalled(false);
                    return;
                }
                // Bounded liveness (CHAOS-2868): a stranded zombie reports a
                // non-terminal status with 0% progress forever. Give up once
                // that has held for the whole window rather than polling and
                // claiming "Live" indefinitely.
                if (Date.now() - pollStartedAt >= MAX_ZERO_PROGRESS_POLL_MS) {
                    stopPolling();
                    setPollStalled(true);
                }
            } finally {
                inFlight = false;
            }
        };

        pollingRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            stopPolling();
        };
    }, [testMode, initialJob, stopPolling]);

    if (!job) return null;

    const isTerminal = TERMINAL_STATUSES.has(job.status);

    return (
        <div
            data-testid="backfill-status"
            className="space-y-3 rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
        >
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Backfill in progress
                    </h3>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        {formatDateUTC(job.since_date)} → {formatDateUTC(job.before_date)}
                    </p>
                </div>
                {!isTerminal && (
                    <span className="text-xs text-(--ink-muted)">
                        {pollStalled ? "Live updates paused" : "Live — refreshing…"}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-(--ink-muted)">{statusLabel(job)}</span>
                <span className="font-medium tabular-nums">{Math.round(job.progress_pct)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-stroke)">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${progressBarClassName(job.status)}`}
                    style={{
                        width: `${Math.max(job.progress_pct, job.status === "pending" || job.status === "planned" ? 2 : 0)}%`,
                    }}
                />
            </div>
        </div>
    );
}
