"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerSync } from "@/lib/admin/server";
import { logger } from "@/lib/logger";
import { type SyncStatus } from "@/lib/sync-types";

const syncLogger = logger.child({ component: "useSyncTrigger" });

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error";
}

interface UseSyncTriggerResult {
    /**
     * Optimistic "running" status right after a trigger, or null once we
     * know it's safe to trust the persisted status again. Consumers should
     * prefer this over the persisted status when non-null. CHAOS-4318: this
     * is a one-shot signal, not a live tracker.
     */
    liveStatus: SyncStatus | null;
    /**
     * True while a trigger is outstanding — from the click until an
     * explicit Refresh confirms the real state (NOT just until the POST
     * resolves). Button should disable/spin.
     */
    isSyncing: boolean;
    /** Trigger a sync for `configId`. */
    trigger: () => void;
}

/**
 * Encapsulates the "Sync Now" trigger (CHAOS-2557a).
 *
 * CHAOS-4318: no more client-side status polling — the Python API replicas
 * are a scarce resource, so a tab must not keep hitting them on a timer
 * after a manual trigger. This fires the trigger, shows an optimistic
 * "running" badge, and does exactly one `router.refresh()` to pick up
 * whatever the backend has persisted by the time the request returns.
 *
 * On success, `liveStatus`/`isSyncing` are deliberately left set — NOT
 * cleared once the POST resolves. Two reasons:
 *   1. Without a poll-to-terminal loop we have no authoritative signal that
 *      the run actually finished, so re-enabling the button the instant the
 *      trigger request returns would let a rapid second click enqueue a
 *      duplicate run while the first is still executing server-side.
 *   2. Clearing the button but not the "Syncing..." badge left a visibly
 *      inconsistent row (enabled button, stale badge).
 * Both only clear together when `SyncConfigTable`'s explicit Refresh click
 * remounts this row (its `refreshToken`-keyed remount resets this hook's
 * state from scratch) and the fresh persisted status takes over — or on
 * error, immediately, so the operator can retry a trigger that never
 * actually started.
 */
export function useSyncTrigger(configId: string): UseSyncTriggerResult {
    const router = useRouter();
    const [liveStatus, setLiveStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const trigger = useCallback(() => {
        setIsSyncing(true);
        setLiveStatus("running");
        void (async () => {
            try {
                const result = await triggerSync(configId);
                if (result.error || !result.data) {
                    setLiveStatus(null);
                    setIsSyncing(false);
                    toast.error(`Unable to start sync: ${result.error || "empty response"}`);
                    return;
                }
                toast.success("Sync triggered — use Refresh to check status");
                router.refresh();
                // Deliberately no `setIsSyncing(false)` here — see doc comment above.
            } catch (error) {
                setLiveStatus(null);
                setIsSyncing(false);
                syncLogger.error({ err: error, configId }, "Sync trigger failed");
                toast.error(`Unable to start sync: ${errorMessage(error)}`);
            }
        })();
    }, [configId, router]);

    return { liveStatus, isSyncing, trigger };
}
