"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteSyncConfig } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

type SyncConfigDeleteControlsProps = {
    readonly configId: string;
    readonly confirmMessage: string;
    readonly successMessage: string;
    readonly targetName: string;
};

export function SyncConfigDeleteControls({
    configId,
    confirmMessage,
    successMessage,
    targetName,
}: SyncConfigDeleteControlsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);

    function handleDelete() {
        startTransition(async () => {
            try {
                const result = await deleteSyncConfig(configId);
                if (result.error) {
                    toast.error(result.error);
                    setShowConfirm(false);
                    return;
                }
                toast.success(successMessage);
                router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(error.message || "Failed to delete sync configuration");
                setShowConfirm(false);
            }
        });
    }

    if (showConfirm) {
        return (
            <div className="flex items-center justify-end gap-2">
                <span className="max-w-48 text-right text-xs text-(--negative)">
                    {confirmMessage}
                </span>
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    aria-label={`Yes, delete ${targetName}`}
                    className="rounded-md bg-(--negative) px-2 py-1 text-xs font-medium text-white hover:opacity-80 disabled:opacity-50"
                >
                    {CTA_LABELS.confirmDeleteSyncConfig}
                </button>
                <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={isPending}
                    aria-label={`Cancel deleting ${targetName}`}
                    className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-foreground hover:bg-(--card-70) disabled:opacity-50"
                >
                    {CTA_LABELS.cancel}
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            aria-label={`Delete ${targetName}`}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-(--negative) hover:bg-(--negative)/10 disabled:opacity-50"
        >
            {CTA_LABELS.delete}
        </button>
    );
}
