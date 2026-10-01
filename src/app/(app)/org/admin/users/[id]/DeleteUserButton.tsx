"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUser } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

type DeleteUserButtonProps = {
    userId: string;
    userEmail: string;
};

export function DeleteUserButton({ userId, userEmail }: DeleteUserButtonProps) {
    const router = useRouter();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);

        const result = await deleteUser(userId);

        if (result.error) {
            toast.error(result.error);
            setIsDeleting(false);
            return;
        }

        router.push("/org/admin/users");
        router.refresh();
    };

    if (isConfirming) {
        return (
            <div className="space-y-2">
                <p className="text-sm text-(--negative)">Delete {userEmail}?</p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-lg bg-(--negative) px-3 py-2 text-sm font-medium text-(--accent-foreground) hover:bg-(--negative)/90 disabled:opacity-50"
                    >
                        {isDeleting ? "Deleting..." : CTA_LABELS.confirm}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsConfirming(false)}
                        disabled={isDeleting}
                        className="flex-1 rounded-lg border border-(--card-stroke) px-3 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70)"
                    >
                        {CTA_LABELS.cancel}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="w-full rounded-lg border border-(--negative)/30 px-4 py-2 text-sm font-medium text-(--negative) hover:bg-(--negative)/12 text-left"
        >
            {CTA_LABELS.deleteUser}
        </button>
    );
}
