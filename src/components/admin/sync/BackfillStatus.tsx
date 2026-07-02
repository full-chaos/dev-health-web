"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getBackfillJobStatus } from "@/lib/admin/server";
import type { BackfillJob } from "@/lib/admin/types";

/** How often to poll for live backfill status. */
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

interface BackfillStatusProps {
    /**
     * Backfill job resolved server-side from PERSISTED state (live
     * `getActiveBackfillJob` fetch, or a test-mode sample) — never derived
     * client-side, so an in-progress backfill survives navigation (CHAOS-2795).
     * Render this component with `key={initialJob?.id ?? "none"}` from the
     * parent so a newly-submitted job resets local poll state on mount
     * instead of needing an effect to resync a changed prop.
     */
    initialJob: BackfillJob | null;
    /** When true, render the provided sample job and never poll a live API. */
    testMode?: boolean;
}

function formatDateOnly(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}

export function BackfillStatus({ initialJob, testMode = false }: BackfillStatusProps) {
    const [job, setJob] = useState<BackfillJob | null>(initialJob);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    // Poll persisted job status while non-terminal. State is only mutated
    // inside the async interval callback, never synchronously in the effect
    // body (mirrors SyncRunDetailLive / useSyncTrigger discipline), and this
    // effect keys off the INITIAL props (fixed at mount via the parent's
    // `key`) rather than the ever-changing local `job` state.
    useEffect(() => {
        if (testMode) return undefined;
        if (!initialJob || TERMINAL_STATUSES.has(initialJob.status)) return undefined;

        let cancelled = false;
        const jobId = initialJob.id;

        const tick = async () => {
            const result = await getBackfillJobStatus(jobId);
            if (cancelled) return;
            if (result.error || !result.data) {
                stopPolling();
                return;
            }
            setJob(result.data);
            if (TERMINAL_STATUSES.has(result.data.status)) {
                stopPolling();
                if (result.data.status === "completed") {
                    toast.success("Backfill completed successfully");
                } else {
                    toast.error(result.data.error_message || "Backfill failed");
                }
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
                        {formatDateOnly(job.since_date)} → {formatDateOnly(job.before_date)}
                    </p>
                </div>
                {!isTerminal && <span className="text-xs text-(--ink-muted)">Live — refreshing…</span>}
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-(--ink-muted)">
                    {job.status === "pending" && "Waiting to start..."}
                    {job.status === "running" &&
                        `Processing chunk ${job.completed_chunks} of ${job.total_chunks}`}
                    {job.status === "completed" && "Backfill complete"}
                    {job.status === "failed" && (job.error_message || "Backfill failed")}
                </span>
                <span className="font-medium tabular-nums">{Math.round(job.progress_pct)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-stroke)">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${
                        job.status === "failed"
                            ? "bg-(--negative)"
                            : job.status === "completed"
                              ? "bg-(--positive)"
                              : "bg-(--accent)"
                    }`}
                    style={{
                        width: `${Math.max(job.progress_pct, job.status === "pending" ? 2 : 0)}%`,
                    }}
                />
            </div>
        </div>
    );
}
