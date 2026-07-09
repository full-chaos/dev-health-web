"use client";

import type { AuditLog } from "@/lib/admin/types";
import { formatDateTimeUTC } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import { AuditIdentityLabel } from "./AuditIdentityLabel";
import { AuditStatusBadge } from "./AuditStatusBadge";

type AuditLogRowsProps = {
    entries: AuditLog[];
    /** Opens the investigation detail surface for the selected row. */
    onRowSelectAction: (entry: AuditLog) => void;
};

/**
 * Investigation-oriented audit-log table (CHAOS-2843). Actor/resource cells
 * render through {@link AuditIdentityLabel} so an unresolved id never becomes
 * the primary label. Compact by design: the fuller record (description,
 * Changes, Request details) lives in the detail drawer, not this row.
 *
 * Each row exposes an explicit "Open details" button rather than making the
 * whole `<tr>` a synthetic button — nested real buttons (the id copy
 * affordances) inside a row-level `role="button"` would make Enter/Space on
 * the copy button bubble up and also open the drawer. Clicking anywhere else
 * in the row still opens it as a pointer-only enhancement.
 */
export function AuditLogRows({ entries, onRowSelectAction }: AuditLogRowsProps) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                    <tr>
                        <th className="px-6 py-4 font-medium">Timestamp</th>
                        <th className="px-6 py-4 font-medium">Action</th>
                        <th className="px-6 py-4 font-medium">Resource</th>
                        <th className="px-6 py-4 font-medium">Actor</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium">
                            <span className="sr-only">Details</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {entries.map((entry) => (
                        <tr
                            key={entry.id}
                            onClick={() => onRowSelectAction(entry)}
                            className="cursor-pointer hover:bg-(--card-70)/50"
                        >
                            <td className="px-6 py-4 text-(--ink-muted)">
                                {formatDateTimeUTC(entry.created_at)}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs">{entry.action}</td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs uppercase tracking-wide text-(--ink-muted)">
                                        {entry.resource_type}
                                    </span>
                                    <AuditIdentityLabel
                                        id={entry.resource_id}
                                        emptyLabel="—"
                                        copyLabel="resource ID"
                                    />
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <AuditIdentityLabel
                                    id={entry.user_id}
                                    emptyLabel="System"
                                    copyLabel="actor ID"
                                />
                            </td>
                            <td className="px-6 py-4">
                                <AuditStatusBadge status={entry.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onRowSelectAction(entry);
                                    }}
                                    className="rounded-full border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-(--ink-muted) transition-colors hover:border-(--ink-muted) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
                                >
                                    {CTA_LABELS.openDetails}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
