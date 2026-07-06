"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
            <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
                <p className="px-4 py-8 text-center text-(--ink-muted)">
                    No retention policies configured.
                </p>
            </div>
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
            <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
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
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            policy.is_active
                                                ? "bg-green-500/10 text-green-500"
                                                : "bg-red-500/10 text-red-500"
                                        }`}
                                    >
                                        {policy.is_active ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {policy.last_run_at ? formatDate(policy.last_run_at) : "Never"}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {policy.last_run_deleted_count ?? "--"}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {formatDate(policy.next_run_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onEditAction(policy)}
                                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium"
                                        >
                                            {CTA_LABELS.edit}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmToggle(policy)}
                                            disabled={togglingId === policy.id}
                                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium disabled:opacity-50"
                                        >
                                            {policy.is_active
                                                ? CTA_LABELS.disableEntry
                                                : CTA_LABELS.enableEntry}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onRequestRunAction(policy)}
                                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium"
                                        >
                                            {CTA_LABELS.runPolicyNow}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(policy)}
                                            className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500"
                                        >
                                            {CTA_LABELS.delete}
                                        </button>
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
