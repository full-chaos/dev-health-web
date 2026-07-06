"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IPAllowlist } from "@/lib/admin/types";
import { currentIpCoveredByRule } from "./cidr";

type IpAllowlistTableProps = {
    entries: IPAllowlist[];
    /** The requesting admin's own apparent IP, or `null` if undetermined. */
    currentIp: string | null;
    togglingId: string | null;
    onEditAction: (entry: IPAllowlist) => void;
    onToggleAction: (entry: IPAllowlist) => void;
    onDeleteAction: (entry: IPAllowlist) => void;
    formatDate: (d: string | null) => string;
};

/** Table of IP allowlist entries with edit/enable-disable/delete actions (CHAOS-2842). */
export function IpAllowlistTable({
    entries,
    currentIp,
    togglingId,
    onEditAction,
    onToggleAction,
    onDeleteAction,
    formatDate,
}: IpAllowlistTableProps) {
    const [confirmToggle, setConfirmToggle] = useState<IPAllowlist | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<IPAllowlist | null>(null);

    if (entries.length === 0) {
        return (
            <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
                <p className="px-4 py-8 text-center text-(--ink-muted)">
                    No IP allowlist entries configured.
                </p>
            </div>
        );
    }

    function willExcludeCurrentIpOnEnable(entry: IPAllowlist): boolean {
        return !entry.is_active && currentIpCoveredByRule(currentIp, entry.ip_range) === false;
    }

    function toggleDescription(entry: IPAllowlist | null): string {
        if (!entry) return "";
        if (entry.is_active) {
            return `Disabling ${entry.ip_range} removes this restriction — requests from outside it will no longer be blocked by this rule.`;
        }
        if (willExcludeCurrentIpOnEnable(entry)) {
            return `Enabling ${entry.ip_range} will start enforcing this restriction. This range does not include your current IP${currentIp ? ` (${currentIp})` : ""} — if it is your only active rule, you may lose admin access.`;
        }
        return `Enabling ${entry.ip_range} will start enforcing this restriction for new requests.`;
    }

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                            <th className="px-4 py-3 text-left font-medium">IP Range</th>
                            <th className="px-4 py-3 text-left font-medium">Description</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                            <th className="px-4 py-3 text-left font-medium">Created</th>
                            <th className="px-4 py-3 text-left font-medium">Expires</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr
                                key={entry.id}
                                className="border-b border-(--card-stroke) last:border-0"
                            >
                                <td className="px-4 py-3 font-mono text-xs">{entry.ip_range}</td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {entry.description ?? "--"}
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            entry.is_active
                                                ? "bg-green-500/10 text-green-500"
                                                : "bg-red-500/10 text-red-500"
                                        }`}
                                    >
                                        {entry.is_active ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {formatDate(entry.created_at)}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {formatDate(entry.expires_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onEditAction(entry)}
                                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium"
                                        >
                                            {CTA_LABELS.edit}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmToggle(entry)}
                                            disabled={togglingId === entry.id}
                                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium disabled:opacity-50"
                                        >
                                            {entry.is_active
                                                ? CTA_LABELS.disableEntry
                                                : CTA_LABELS.enableEntry}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(entry)}
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
                title={confirmToggle?.is_active ? "Disable this IP rule?" : "Enable this IP rule?"}
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
                title="Delete this IP rule?"
                tone="destructive"
                description={`This permanently removes ${confirmDelete?.ip_range ?? ""} from the allowlist. Requests from this range will no longer be treated as trusted by this rule. This cannot be undone.`}
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
