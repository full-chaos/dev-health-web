"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteSyncConfig } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

type SyncConfigDeleteControlsProps = {
    readonly configId: string;
    readonly confirmMessage: string;
    readonly disabled?: boolean;
    readonly onBusyChangeAction?: (busy: boolean) => void;
    readonly successMessage: string;
    readonly targetName: string;
};

export function SyncConfigDeleteControls({
    configId,
    confirmMessage,
    disabled = false,
    onBusyChangeAction,
    successMessage,
    targetName,
}: SyncConfigDeleteControlsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);

    function setConfirmOpen(isOpen: boolean) {
        setShowConfirm(isOpen);
        onBusyChangeAction?.(isOpen);
    }

    function handleDelete() {
        startTransition(async () => {
            try {
                const result = await deleteSyncConfig(configId);
                if (result.error) {
                    toast.error(result.error);
                    setConfirmOpen(false);
                    return;
                }
                toast.success(successMessage);
                setConfirmOpen(false);
                router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(error.message || "Failed to delete sync configuration");
                setConfirmOpen(false);
            }
        });
    }

    function handleCancel() {
        if (!isPending) setConfirmOpen(false);
    }

    const title = `Delete ${targetName}?`;

    return (
        <>
            <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={disabled || isPending}
                aria-label={`Delete ${targetName}`}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-(--negative) hover:bg-(--negative)/10 disabled:opacity-50"
            >
                {CTA_LABELS.delete}
            </button>
            <ConfirmDialog
                isOpen={showConfirm}
                title={title}
                description={confirmMessage === title ? undefined : confirmMessage}
                tone="destructive"
                confirmLabel={CTA_LABELS.confirmDeleteSyncConfig}
                isPending={isPending}
                onConfirmAction={handleDelete}
                onCancelAction={handleCancel}
            />
        </>
    );
}
