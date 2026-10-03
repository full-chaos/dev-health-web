"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/shared/Button";
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
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-(--foreground)">
                            Delete Organization
                        </p>
                        <p className="text-xs text-(--ink-muted)">
                            Once you delete an organization, there is no going back. A preview of
                            what is deleted comes first; then type the organization name to confirm.
                        </p>
                    </div>
                    <Button
                        variant="danger"
                        onClick={handleStartDelete}
                        disabled={isPending}
                        icon={<Trash2 />}
                    >
                        {isPending ? "Loading..." : "Delete Organization"}
                    </Button>
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
