"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerSync, getSyncRunStatus, getSyncJobs } from "@/lib/admin/server";
import {
    type SyncStatus,
    type SyncPollTarget,
    resolveSyncPollTarget,
    mapPlannerRunStatus,
    resolveLegacyJobStatus,
    isTerminalSyncStatus,
} from "@/lib/sync-types";

/** How often to poll for live run status. */
const POLL_INTERVAL_MS = 3500;
/** Safety cap so a stuck/abandoned run never spins forever (~5 min). */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

interface UseSyncTriggerResult {
    /**
     * Live UI status while a manual sync is in flight, or null when idle.
     * Consumers should prefer this over the persisted status when non-null so
     * the card transitions (current) -> Running -> Success/Failed live.
     */
    liveStatus: SyncStatus | null;
    /** True while triggering or polling a run (button should disable/spin). */
    isSyncing: boolean;
    /** Trigger a sync for `configId`, then poll the correct endpoint. */
    trigger: () => void;
}

/**
 * Encapsulates the "Sync Now" trigger + client-side status polling (CHAOS-2557a).
 *
 * Mirrors the established poll-until-terminal pattern in RunBackfill.tsx and the
 * reports detail page: fire the trigger, read the response union to learn which
 * endpoint can see the run, then poll every few seconds until a terminal state
 * (or a timeout) before calling router.refresh() so the persisted last_sync_*
 * fields render.
 */
export function useSyncTrigger(configId: string): UseSyncTriggerResult {
    const router = useRouter();
    const [liveStatus, setLiveStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    // Cleanup timers on unmount.
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    /** Fetch the current normalized status for a poll target. */
    const fetchStatus = useCallback(async (target: SyncPollTarget): Promise<SyncStatus> => {
        if (target.kind === "planner") {
            const res = await getSyncRunStatus(target.runId);
            if (res.error || !res.data) {
                throw new Error(res.error || "Failed to read sync run status");
            }
            return mapPlannerRunStatus(res.data.status);
        }
        const res = await getSyncJobs(target.configId);
        if (res.error || !res.data) {
            throw new Error(res.error || "Failed to read sync job status");
        }
        // Track the specific run we triggered rather than blindly trusting the
        // head of the list — scheduled retries, concurrent admin clicks, or
        // backend ordering lag can surface an UNRELATED job first, which would
        // otherwise make us report completion for the wrong run. When the
        // triggered row isn't visible yet this returns "running" so we keep
        // polling (the max-timeout below still ends things gracefully).
        return resolveLegacyJobStatus(res.data, target.runId);
    }, []);

    const startPolling = useCallback(
        (target: SyncPollTarget) => {
            stopPolling();

            const finishTerminal = (status: SyncStatus) => {
                stopPolling();
                setLiveStatus(status);
                setIsSyncing(false);
                if (status === "success") {
                    toast.success("Sync completed");
                } else {
                    toast.error("Sync failed");
                }
                router.refresh();
            };

            pollingRef.current = setInterval(async () => {
                try {
                    const status = await fetchStatus(target);
                    if (isTerminalSyncStatus(status)) {
                        finishTerminal(status);
                    } else {
                        setLiveStatus(status);
                    }
                } catch {
                    // Stop on poll error, drop back to the persisted status, and
                    // let the user retry rather than leave an infinite spinner.
                    stopPolling();
                    setLiveStatus(null);
                    setIsSyncing(false);
                    toast.error("Lost track of sync status — refresh to check");
                }
            }, POLL_INTERVAL_MS);

            // Hard timeout fallback: stop spinning and refresh to show whatever
            // the backend persisted.
            timeoutRef.current = setTimeout(() => {
                stopPolling();
                setLiveStatus(null);
                setIsSyncing(false);
                router.refresh();
            }, MAX_POLL_DURATION_MS);
        },
        [fetchStatus, router, stopPolling],
    );

    const trigger = useCallback(() => {
        setIsSyncing(true);
        setLiveStatus("running");
        void (async () => {
            try {
                const result = await triggerSync(configId);
                if (result.error || !result.data) {
                    setLiveStatus(null);
                    setIsSyncing(false);
                    toast.error(result.error || "Failed to trigger sync");
                    return;
                }
                toast.success("Sync triggered");
                const target = resolveSyncPollTarget(result.data, configId);
                if (!target) {
                    // No pollable id came back — fall back to a single refresh.
                    setLiveStatus(null);
                    setIsSyncing(false);
                    router.refresh();
                    return;
                }
                startPolling(target);
            } catch {
                setLiveStatus(null);
                setIsSyncing(false);
                toast.error("Failed to trigger sync");
            }
        })();
    }, [configId, router, startPolling]);

    return { liveStatus, isSyncing, trigger };
}
