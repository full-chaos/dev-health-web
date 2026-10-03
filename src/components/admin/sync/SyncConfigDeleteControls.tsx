"use client";

import { actionFailureMessage } from "@/lib/actionFailure";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
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
    /** Where to go after a delete (the detail page of the deleted config); otherwise the page refreshes. */
    readonly afterDeleteHref?: string;
    /** Button size; the list rows use the small one, the page header the regular one. */
    readonly size?: "sm" | "md";
};

export function SyncConfigDeleteControls({
    configId,
    confirmMessage,
    disabled = false,
    onBusyChangeAction,
    successMessage,
    targetName,
    afterDeleteHref,
    size = "sm",
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
                if (afterDeleteHref) router.push(afterDeleteHref);
                else router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(actionFailureMessage(error, "deleteSyncConfig"));
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
            <Button
                variant="danger"
                size={size}
                onClick={() => setConfirmOpen(true)}
                disabled={disabled || isPending}
                aria-label={`Delete ${targetName}`}
            >
                {CTA_LABELS.delete}
            </Button>
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
