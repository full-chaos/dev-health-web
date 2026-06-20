"use client";

import { useSyncTrigger } from "./useSyncTrigger";

interface SyncNowButtonProps {
    configId: string;
    className?: string;
}

export function SyncNowButton({ configId, className }: SyncNowButtonProps) {
    const { isSyncing, trigger: handleTrigger } = useSyncTrigger(configId);

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
