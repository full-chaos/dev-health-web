"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SettingsSection } from "./SettingsSection";
import { deleteCurrentOrg, dryRunDeleteCurrentOrg } from "@/lib/admin/server";
import { DeletionPlanPreview, type DeletionResult } from "./DeletionPlanPreview";

type DangerZoneProps = {
    orgName?: string;
};

export function DangerZone({ orgName }: DangerZoneProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [plan, setPlan] = useState<DeletionResult | null>(null);

    const handleStartDelete = () => {
        startTransition(async () => {
            const result = await dryRunDeleteCurrentOrg();
            if (result.error) {
                toast.error(result.error);
            } else {
                setPlan(result.data ?? null);
                setShowConfirm(true);
            }
        });
    };

    const handleDelete = () => {
        if (confirmText !== orgName) return;

        startTransition(async () => {
            const result = await deleteCurrentOrg();
            if (result.error) {
                toast.error(result.error);
            } else {
                // Org is gone — redirect to sign-out / landing
                router.push("/api/auth/signout?callbackUrl=/");
            }
        });
    };

    return (
        <SettingsSection
            title="Danger Zone"
            description="Irreversible actions for your organization."
            danger
        >
            {!showConfirm ? (
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-(--foreground)">
                            Delete Organization
                        </p>
                        <p className="text-sm text-(--ink-muted)">
                            Once you delete an organization, there is no going back. Please be
                            certain.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleStartDelete}
                        disabled={isPending}
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isPending ? "Loading..." : "Delete Organization"}
                    </button>
                </div>
            ) : plan ? (
                <DeletionPlanPreview
                    plan={plan}
                    onConfirm={handleDelete}
                    onCancel={() => {
                        setShowConfirm(false);
                        setConfirmText("");
                        setPlan(null);
                    }}
                    isPending={isPending}
                    confirmText={confirmText}
                    expectedConfirmText={orgName || ""}
                    setConfirmText={setConfirmText}
                />
            ) : null}
        </SettingsSection>
    );
}
