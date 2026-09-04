"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { getBackfillJobStatus } from "@/lib/admin/server";
import { formatDateUTC } from "@/lib/formatters";
import { getSyncUnitErrorPresentation } from "@/lib/admin/syncUnitErrorPresentation";
import { RefreshControl } from "@/components/admin/RefreshControl";
import type { BackfillJob } from "@/lib/admin/types";

/**
 * Terminal BackfillJob statuses across both backend paths: the legacy
 * per-chunk path (`completed` | `failed`) and the planner fanout path
 * (`success` | `partial_failed` | `failed`), whose lifecycle is `planned` ->
 * `dispatching` -> `running` -> `success` | `partial_failed` | `failed`
 * (mirrors ops routers/sync.py, sync/planner.py, models/integrations.py).
 */
const TERMINAL_STATUSES = new Set(["completed", "failed", "success", "partial_failed"]);

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
    const failureTitle = job.error_message
        ? getSyncUnitErrorPresentation(job.error_message, null).title
        : null;
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
            return failureTitle ?? "Completed with failures";
        case "failed":
            return failureTitle ?? "Backfill failed";
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
    }

    // In test mode there is no live fetch to time-stamp, so fall back to the
    // job's own persisted `updated_at` — deterministic for Storybook/visual
    // evidence rather than a live `Date.now()` read.
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
        testMode ? (initialJob?.updated_at ?? null) : initialJob ? new Date().toISOString() : null,
    );
    const [isRefreshing, setIsRefreshing] = useState(false);
    const inFlightRef = useRef(false);

    // CHAOS-4318: manual refresh only — read persisted job status on demand
    // via the Refresh control instead of a setInterval poll loop.
    const refresh = useCallback(async () => {
        if (!job || testMode || inFlightRef.current) return;
        inFlightRef.current = true;
        setIsRefreshing(true);
        try {
            const result = await getBackfillJobStatus(job.id);
            if (result.error || !result.data) return;
            setJob(result.data);
            setLastUpdatedAt(new Date().toISOString());
            if (TERMINAL_STATUSES.has(result.data.status)) {
                if (result.data.status === "completed" || result.data.status === "success") {
                    toast.success("Backfill completed successfully");
                } else if (result.data.status === "partial_failed") {
                    const failureTitle = result.data.error_message
                        ? getSyncUnitErrorPresentation(result.data.error_message, null).title
                        : null;
                    toast.warning(failureTitle ?? "Backfill completed with some failures");
                } else {
                    const failureTitle = result.data.error_message
                        ? getSyncUnitErrorPresentation(result.data.error_message, null).title
                        : null;
                    toast.error(failureTitle ?? "Backfill failed");
                }
            }
        } finally {
            inFlightRef.current = false;
            setIsRefreshing(false);
        }
    }, [job, testMode]);

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
                    <RefreshControl
                        onRefresh={refresh}
                        lastUpdatedAt={lastUpdatedAt}
                        isRefreshing={isRefreshing}
                    />
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
