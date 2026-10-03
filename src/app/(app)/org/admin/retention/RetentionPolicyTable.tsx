"use client";

import { useState } from "react";
import { CircleCheck, CircleSlash, Clock } from "lucide-react";

import { StatusPill } from "@/components/admin/StatusPill";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatNumber } from "@/lib/formatters";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { RetentionPolicy } from "@/lib/admin/types";

type RetentionPolicyTableProps = {
    policies: RetentionPolicy[];
    togglingId: string | null;
    onEditAction: (policy: RetentionPolicy) => void;
    onToggleAction: (policy: RetentionPolicy) => void;
    onDeleteAction: (policy: RetentionPolicy) => void;
    onRequestRunAction: (policy: RetentionPolicy) => void;
    formatDate: (d: string | null) => string;
};

/** Table of retention policies with edit/enable-disable/run-now/delete actions (CHAOS-2842). */
export function RetentionPolicyTable({
    policies,
    togglingId,
    onEditAction,
    onToggleAction,
    onDeleteAction,
    onRequestRunAction,
    formatDate,
}: RetentionPolicyTableProps) {
    const [confirmToggle, setConfirmToggle] = useState<RetentionPolicy | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<RetentionPolicy | null>(null);

    if (policies.length === 0) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                icon={<Clock aria-hidden="true" />}
                title="No retention policies configured."
                description="Add a policy to delete old records on a schedule."
            />
        );
    }

    function toggleDescription(policy: RetentionPolicy | null): string {
        if (!policy) return "";
        return policy.is_active
            ? `Disabling this policy stops future automatic deletion of ${policy.resource_type} records older than ${policy.retention_days} days. Records already deleted by previous runs are not restored.`
            : `Enabling this policy resumes automatic deletion of ${policy.resource_type} records older than ${policy.retention_days} days on its next scheduled run.`;
    }

    return (
        <>
            <div className="overflow-x-auto rounded-(--radius-md) border border-(--card-stroke)">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                            <th className="px-4 py-3 text-left font-medium">Resource Type</th>
                            <th className="px-4 py-3 text-left font-medium">Retention</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Last Run</th>
                            <th className="px-4 py-3 text-left font-medium">Deleted</th>
                            <th className="px-4 py-3 text-left font-medium">Next Run</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {policies.map((policy) => (
                            <tr
                                key={policy.id}
                                className="border-b border-(--card-stroke) last:border-0"
                            >
                                <td className="px-4 py-3 font-mono text-xs">
                                    {policy.resource_type}
                                </td>
                                <td className="px-4 py-3">{policy.retention_days} days</td>
                                <td className="px-4 py-3">
                                    {policy.is_active ? (
                                        <StatusPill tone="positive" icon={CircleCheck}>
                                            Active
                                        </StatusPill>
                                    ) : (
                                        <StatusPill tone="negative" icon={CircleSlash}>
                                            Inactive
                                        </StatusPill>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {policy.last_run_at ? formatDate(policy.last_run_at) : "Never"}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {policy.last_run_deleted_count == null
                                        ? "—"
                                        : formatNumber(policy.last_run_deleted_count)}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {formatDate(policy.next_run_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <Button size="sm" onClick={() => onEditAction(policy)}>
                                            {CTA_LABELS.edit}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => setConfirmToggle(policy)}
                                            disabled={togglingId === policy.id}
                                        >
                                            {policy.is_active
                                                ? CTA_LABELS.disableEntry
                                                : CTA_LABELS.enableEntry}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => onRequestRunAction(policy)}
                                        >
                                            {CTA_LABELS.runPolicyNow}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => setConfirmDelete(policy)}
                                        >
                                            {CTA_LABELS.delete}
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDialog
                isOpen={confirmToggle !== null}
                title={
                    confirmToggle?.is_active
                        ? "Disable this retention policy?"
                        : "Enable this retention policy?"
                }
                tone={confirmToggle?.is_active ? "destructive" : "default"}
                description={toggleDescription(confirmToggle)}
                confirmLabel={
                    confirmToggle?.is_active ? CTA_LABELS.disableEntry : CTA_LABELS.enableEntry
                }
                isPending={togglingId === confirmToggle?.id}
                onConfirmAction={() => {
                    if (confirmToggle) onToggleAction(confirmToggle);
                    setConfirmToggle(null);
                }}
                onCancelAction={() => setConfirmToggle(null)}
            />

            <ConfirmDialog
                isOpen={confirmDelete !== null}
                title="Delete this retention policy?"
                tone="destructive"
                description={`This stops enforcing retention for ${confirmDelete?.resource_type ?? ""}. It does not restore any records already deleted by previous runs. This cannot be undone.`}
                confirmLabel={CTA_LABELS.delete}
                onConfirmAction={() => {
                    if (confirmDelete) onDeleteAction(confirmDelete);
                    setConfirmDelete(null);
                }}
                onCancelAction={() => setConfirmDelete(null)}
            />
        </>
    );
}
