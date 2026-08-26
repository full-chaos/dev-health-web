"use client";

import { useSyncTrigger } from "./useSyncTrigger";

interface SyncNowButtonProps {
    configId: string;
    className?: string;
    /**
     * A persisted value guaranteed to change once this config's next sync
     * lands (e.g. the coverage summary's `generated_at`, which regenerates
     * after every sync) — lets useSyncTrigger clear its optimistic
     * "Syncing…" state once fresher data proves the run landed, instead of
     * staying disabled forever. Pass `null` if unavailable.
     */
    freshnessSignal?: string | null;
}

export function SyncNowButton({ configId, className, freshnessSignal = null }: SyncNowButtonProps) {
    const { isSyncing, trigger: handleTrigger } = useSyncTrigger(configId, freshnessSignal);

    return (
        <button
            type="button"
            onClick={handleTrigger}
            disabled={isSyncing}
            className={
                className ??
                "cursor-pointer rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-80 active:opacity-70 disabled:opacity-50 transition-opacity"
            }
        >
            {isSyncing ? "Syncing…" : "Sync Now"}
        </button>
    );
}
