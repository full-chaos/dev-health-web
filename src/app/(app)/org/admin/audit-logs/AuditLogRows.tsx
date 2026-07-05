"use client";

import type { KeyboardEvent } from "react";
import type { AuditLog } from "@/lib/admin/types";
import { formatDateTimeUTC } from "@/lib/formatters";
import { AuditIdentityLabel } from "./AuditIdentityLabel";
import { AuditStatusBadge } from "./AuditStatusBadge";

type AuditLogRowsProps = {
    entries: AuditLog[];
    /** Opens the investigation detail surface for the clicked row. */
    onRowSelectAction: (entry: AuditLog) => void;
};

/**
 * Investigation-oriented audit-log table (CHAOS-2843). Rows are clickable —
 * opening the detail drawer — and actor/resource cells render through
 * {@link AuditIdentityLabel} so an unresolved id never becomes the primary
 * label. Compact by design: the fuller record (description, payload,
 * context) lives in the detail drawer, not crammed into this row.
 */
export function AuditLogRows({ entries, onRowSelectAction }: AuditLogRowsProps) {
    const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, entry: AuditLog) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onRowSelectAction(entry);
        }
    };

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
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {entries.map((entry) => (
                        <tr
                            key={entry.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onRowSelectAction(entry)}
                            onKeyDown={(event) => handleKeyDown(event, entry)}
                            className="cursor-pointer hover:bg-(--card-70)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
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
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
