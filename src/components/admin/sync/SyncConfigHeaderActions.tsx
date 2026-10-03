"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonClassName } from "@/components/shared/Button";
import { toggleSyncActive } from "@/lib/admin/server";
import type { SyncConfig } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";

import { persistedStatus } from "./syncConfigTableModel";
import { SyncConfigDeleteControls } from "./SyncConfigDeleteControls";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { useSyncTrigger } from "./useSyncTrigger";

/**
 * The header of a sync configuration (design, MAPPING A12): its status, then Edit, Pause or Resume,
 * Delete and Sync Now. Each action is the call the list row already makes (`toggleSyncActive`,
 * `deleteSyncConfig` with its confirm, `triggerSync`); nothing new is computed.
 */
export function SyncConfigHeaderActions({ config }: { readonly config: SyncConfig }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isDeleteBusy, setIsDeleteBusy] = useState(false);
    const { liveStatus, isSyncing, trigger } = useSyncTrigger(config.id, config.last_sync_at);
    const status = liveStatus ?? persistedStatus(config);
    const busy = isPending || isSyncing || isDeleteBusy;

    function handleToggleActive() {
        startTransition(async () => {
            try {
                const result = await toggleSyncActive(config.id, !config.is_active);
                if (result.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success(config.is_active ? "Sync paused" : "Sync resumed");
                router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(error.message || "Failed to update sync configuration");
            }
        });
    }

    return (
        <>
            <SyncStatusBadge status={status} />
            <Link
                href={`/org/admin/sync/${encodeURIComponent(config.id)}/edit`}
                className={buttonClassName("secondary")}
            >
                {CTA_LABELS.edit}
            </Link>
            <Button onClick={handleToggleActive} disabled={busy}>
                {config.is_active ? CTA_LABELS.pauseSync : CTA_LABELS.resumeSync}
            </Button>
            <SyncConfigDeleteControls
                configId={config.id}
                confirmMessage={`Delete ${config.name}?`}
                disabled={isPending || isSyncing}
                onBusyChangeAction={setIsDeleteBusy}
                successMessage="Config deleted"
                targetName={config.name}
                afterDeleteHref="/org/admin/sync"
            />
            <Button variant="primary" onClick={trigger} disabled={busy}>
                {isSyncing ? CTA_LABELS.syncing : CTA_LABELS.syncNow}
            </Button>
        </>
    );
}
