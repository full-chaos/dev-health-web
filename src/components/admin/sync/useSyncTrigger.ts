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
     * True while a trigger is outstanding — from the click until the
     * caller's `freshnessSignal` proves the run landed (NOT just until the
     * POST resolves). Button should disable/spin.
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
 * instant the trigger request returns would let a rapid second click (or an
 * unrelated Refresh elsewhere on the page swapping in still-stale props)
 * enqueue a duplicate run while the first is still executing server-side.
 *
 * Instead, `freshnessSignal` — some persisted value the caller passes in
 * that is guaranteed to change once this config's next sync attempt lands
 * (`SyncConfig.last_sync_at` for the table row; a coverage summary's
 * `generated_at` for the standalone button, since its coverage projection
 * regenerates after every sync) — is the authoritative clear signal: this
 * hook captures its value at the moment `trigger()` fires, and clears the
 * optimistic state once a LATER render's `freshnessSignal` no longer
 * matches that baseline. That only happens once the backend has actually
 * persisted a completed attempt (success or failure) for this config,
 * however the fresh value arrives (an explicit page-level Refresh, an
 * unrelated re-render, navigation). Comparing by inequality rather than a
 * fixed timestamp deliberately avoids any client/server clock-skew
 * assumption. Pass `null` if no such signal is available — the optimistic
 * state will simply never auto-clear for that caller, same as before this
 * parameter existed.
 */
export function useSyncTrigger(
    configId: string,
    freshnessSignal: string | null,
): UseSyncTriggerResult {
    const router = useRouter();
    const [liveStatus, setLiveStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    // The freshnessSignal at the moment trigger() was called, or undefined
    // when no trigger is outstanding. State, not a ref — a ref's `.current`
    // may not be read during render (react-hooks/refs), and this value is
    // read during the render-time reset below.
    const [baselineLastSyncAt, setBaselineLastSyncAt] = useState<string | null | undefined>(
        undefined,
    );

    // Render-time reset — the same documented React pattern used by
    // BackfillStatus's `backfillJobSyncKey` and SyncProgressBar's
    // `syncedConfigId` to resync local state from props without a
    // react-hooks/set-state-in-effect violation. Once `freshnessSignal`
    // moves away from the baseline captured at trigger time, the persisted
    // state has caught up and it's safe to drop the optimistic override.
    if (baselineLastSyncAt !== undefined && freshnessSignal !== baselineLastSyncAt) {
        setBaselineLastSyncAt(undefined);
        setLiveStatus(null);
        setIsSyncing(false);
    }

    const trigger = useCallback(() => {
        setBaselineLastSyncAt(freshnessSignal);
        setIsSyncing(true);
        setLiveStatus("running");
        void (async () => {
            try {
                const result = await triggerSync(configId);
                if (result.error || !result.data) {
                    setBaselineLastSyncAt(undefined);
                    setLiveStatus(null);
                    setIsSyncing(false);
                    toast.error(`Unable to start sync: ${result.error || "empty response"}`);
                    return;
                }
                toast.success("Sync triggered — use Refresh to check status");
                router.refresh();
                // Deliberately no `setLiveStatus`/`setIsSyncing` clear here
                // — see doc comment above.
            } catch (error) {
                setBaselineLastSyncAt(undefined);
                setLiveStatus(null);
                setIsSyncing(false);
                syncLogger.error({ err: error, configId }, "Sync trigger failed");
                toast.error(`Unable to start sync: ${errorMessage(error)}`);
            }
        })();
    }, [configId, router, freshnessSignal]);

    return { liveStatus, isSyncing, trigger };
}
