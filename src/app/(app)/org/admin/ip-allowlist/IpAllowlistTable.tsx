"use client";

import { useState } from "react";
import { CircleCheck, CircleSlash, Lock } from "lucide-react";

import { StatusPill } from "@/components/admin/StatusPill";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataState } from "@/components/ui/DataState";
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
            <DataState
                variant="detector-enabled-no-findings"
                icon={<Lock aria-hidden="true" />}
                title="No IP allowlist entries configured."
                description="Add a rule to allow an address or a CIDR range."
            />
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
            <div className="overflow-x-auto rounded-(--radius-md) border border-(--card-stroke)">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                            <th className="px-4 py-3 text-left font-medium">IP Range</th>
                            <th className="px-4 py-3 text-left font-medium">Description</th>
                            <th className="px-4 py-3 text-left font-medium">Added</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr
                                key={entry.id}
                                className="border-b border-(--card-stroke) last:border-0"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex flex-col items-start gap-1">
                                        <span className="font-mono text-xs">{entry.ip_range}</span>
                                        {entry.is_active ? (
                                            <StatusPill tone="positive" icon={CircleCheck}>
                                                Active
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="negative" icon={CircleSlash}>
                                                Inactive
                                            </StatusPill>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {entry.description ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    <div>{formatDate(entry.created_at)}</div>
                                    {entry.expires_at ? (
                                        <div className="mt-0.5 text-xs">
                                            Expires {formatDate(entry.expires_at)}
                                        </div>
                                    ) : null}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="sm" onClick={() => onEditAction(entry)}>
                                            {CTA_LABELS.edit}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => setConfirmToggle(entry)}
                                            disabled={togglingId === entry.id}
                                        >
                                            {entry.is_active
                                                ? CTA_LABELS.disableEntry
                                                : CTA_LABELS.enableEntry}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => setConfirmDelete(entry)}
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
