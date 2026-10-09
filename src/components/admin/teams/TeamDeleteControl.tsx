"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { deleteTeam } from "@/lib/admin/server";
import { actionFailureMessage } from "@/lib/actionFailure";
import { CTA_LABELS } from "@/lib/design/cta";

type TeamDeleteControlProps = {
    readonly teamId: string;
    readonly teamName: string;
};

/** Delete button for one manually created team, behind a confirm dialog. */
export function TeamDeleteControl({ teamId, teamName }: TeamDeleteControlProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);

    function handleDelete() {
        startTransition(async () => {
            try {
                const result = await deleteTeam(teamId);
                if (result.error) {
                    toast.error(result.error);
                    setShowConfirm(false);
                    return;
                }
                toast.success(`${teamName} deleted`);
                setShowConfirm(false);
                router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(actionFailureMessage(error, "deleteTeam"));
                setShowConfirm(false);
            }
        });
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={isPending}
                aria-label={`Delete ${teamName}`}
                className="text-(--negative) hover:underline"
            >
                {CTA_LABELS.delete}
            </button>
            <ConfirmDialog
                isOpen={showConfirm}
                title={`Delete ${teamName}?`}
                description="This removes the team and its mappings. This cannot be undone."
                tone="destructive"
                confirmLabel={CTA_LABELS.delete}
                isPending={isPending}
                onConfirmAction={handleDelete}
                onCancelAction={() => {
                    if (!isPending) setShowConfirm(false);
                }}
            />
        </>
    );
}
