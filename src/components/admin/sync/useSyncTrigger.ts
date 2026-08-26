"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerSync } from "@/lib/admin/server";
import { logger } from "@/lib/logger";
import { resolveSyncPollTarget, type SyncStatus } from "@/lib/sync-types";

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
     * True while a trigger is outstanding — from the click until the
     * caller's `freshnessSignal` proves the run landed, or an explicit
     * `refreshToken` bump unlocks it (NOT just until the POST resolves).
     * Button should disable/spin.
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
 * `liveStatus`/`isSyncing` are deliberately NOT cleared once the trigger
 * POST resolves. Without a poll-to-terminal loop there's no signal at that
 * moment that the run actually finished — re-enabling the button the
 * instant the trigger request returns would let a rapid second click enqueue
 * a duplicate run while the first is still executing server-side.
 *
 * Two independent signals clear the lock, either is sufficient:
 *
 *   1. `freshnessSignal` — some persisted value the caller passes in that
 *      is guaranteed to change once this config's next sync attempt lands
 *      (`SyncConfig.last_sync_at` for the table row; a coverage summary's
 *      `generated_at` for the standalone button). Captured at trigger time;
 *      clears once a later render's value differs from that baseline.
 *      Comparing by inequality rather than a fixed timestamp deliberately
 *      avoids any client/server clock-skew assumption.
 *   2. `refreshToken` — a counter the caller bumps on every EXPLICIT user
 *      Refresh click (page- or table-level). An operator asking for a
 *      refresh is itself authoritative: once they've done that, trust
 *      whatever the server now says over our own optimism, even if
 *      `freshnessSignal` happens not to have moved. This is what stops a
 *      batch child config — whose `last_sync_at` the backend may only
 *      advance on the parent, never the child row itself — from staying
 *      locked forever with nothing but a full page reload able to clear it.
 *
 * Both comparisons are suppressed while THIS hook's own trigger request is
 * still unresolved (`isRequestPending`): otherwise an unrelated
 * freshnessSignal/refreshToken change arriving mid-flight — a scheduled run
 * for the same config, another tab, another operator's Refresh click —
 * could clear the lock before our own POST has even resolved, letting a
 * second click race ahead of it.
 */
export function useSyncTrigger(
    configId: string,
    freshnessSignal: string | null,
    refreshToken: number = 0,
): UseSyncTriggerResult {
    const router = useRouter();
    const [liveStatus, setLiveStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    // True only while THIS hook's own triggerSync() call is unresolved —
    // narrower than `isSyncing`, which also stays true afterward while
    // waiting on freshnessSignal/refreshToken. Gates the render-time reset
    // below.
    const [isRequestPending, setIsRequestPending] = useState(false);
    // The freshnessSignal/refreshToken at the moment trigger() was called,
    // or undefined when no trigger is outstanding. State, not a ref — a
    // ref's `.current` may not be read during render (react-hooks/refs),
    // and these values are read during the render-time reset below.
    const [baselineLastSyncAt, setBaselineLastSyncAt] = useState<string | null | undefined>(
        undefined,
    );
    const [baselineRefreshToken, setBaselineRefreshToken] = useState<number | undefined>(undefined);

    // Render-time reset — the same documented React pattern used by
    // BackfillStatus's `backfillJobSyncKey` and SyncProgressBar's
    // `syncedConfigId` to resync local state from props without a
    // react-hooks/set-state-in-effect violation. Once EITHER signal moves
    // away from the baseline captured at trigger time — and our own request
    // has actually resolved — it's safe to drop the optimistic override.
    if (!isRequestPending && baselineLastSyncAt !== undefined) {
        const freshnessChanged = freshnessSignal !== baselineLastSyncAt;
        const refreshedByOperator = refreshToken !== baselineRefreshToken;
        if (freshnessChanged || refreshedByOperator) {
            setBaselineLastSyncAt(undefined);
            setBaselineRefreshToken(undefined);
            setLiveStatus(null);
            setIsSyncing(false);
        }
    }

    const trigger = useCallback(() => {
        setBaselineLastSyncAt(freshnessSignal);
        setBaselineRefreshToken(refreshToken);
        setIsRequestPending(true);
        setIsSyncing(true);
        setLiveStatus("running");
        void (async () => {
            try {
                const result = await triggerSync(configId);
                setIsRequestPending(false);
                if (result.error || !result.data) {
                    setBaselineLastSyncAt(undefined);
                    setBaselineRefreshToken(undefined);
                    setLiveStatus(null);
                    setIsSyncing(false);
                    toast.error(`Unable to start sync: ${result.error || "empty response"}`);
                    return;
                }
                // Some accepted triggers never actually dispatch a run (a
                // disabled/no-op planning outcome) — mirrors the pollable-id
                // check the pre-CHAOS-4318 poll-to-terminal code used to
                // decide whether there was anything to track. With nothing
                // dispatched, freshnessSignal will never change on its own,
                // so clear immediately instead of leaving the button stuck.
                if (!resolveSyncPollTarget(result.data, configId)) {
                    setBaselineLastSyncAt(undefined);
                    setBaselineRefreshToken(undefined);
                    setLiveStatus(null);
                    setIsSyncing(false);
                }
                toast.success("Sync triggered — use Refresh to check status");
                router.refresh();
                // Otherwise deliberately no further clear here — see doc
                // comment above.
            } catch (error) {
                setIsRequestPending(false);
                setBaselineLastSyncAt(undefined);
                setBaselineRefreshToken(undefined);
                setLiveStatus(null);
                setIsSyncing(false);
                syncLogger.error({ err: error, configId }, "Sync trigger failed");
                toast.error(`Unable to start sync: ${errorMessage(error)}`);
            }
        })();
    }, [configId, router, freshnessSignal, refreshToken]);

    return { liveStatus, isSyncing, trigger };
}
