"use client";

/**
 * Unified AuditLogTable — configurable for both admin (org-level) and
 * billing (superadmin) audit log variants.
 *
 * Replaces:
 *   - src/components/superadmin/AuditLogTable.tsx   (variant="admin")
 *   - src/components/admin/billing/AuditLogTable.tsx (variant="billing")
 */

// ============================================================================
// Shared entry shape — fields common to both AuditLog and BillingAuditEntry.
// ============================================================================

export type AuditEntry = {
    id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    created_at: string;
    /** Admin variant only */
    user_id?: string | null;
    status?: string | null;
    description?: string | null;
    /** Billing variant only */
    reconciliation_status?: string | null;
};

// ============================================================================
// Variant: billing — colourful action badges + clickable rows
// ============================================================================

const ACTION_BADGE_COLORS: Record<string, string> = {
    plan: "bg-(--card-stroke) text-(--ink-muted)",
    subscription: "bg-(--card-stroke) text-(--ink-muted)",
    invoice: "bg-(--card-stroke) text-(--ink-muted)",
    refund: "bg-(--card-stroke) text-(--ink-muted)",
    reconciliation: "bg-(--card-stroke) text-(--ink-muted)",
};

function actionBadgeClass(action: string): string {
    const group = action.split(".", 1)[0] ?? "";
    return ACTION_BADGE_COLORS[group] ?? "bg-(--card-stroke) text-(--ink-muted)";
}

function BillingAuditLogTable({
    entries,
    onSelect,
}: {
    entries: AuditEntry[];
    onSelect?: (id: string) => void;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-80)">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                    <tr>
                        <th className="px-4 py-3 font-medium">Action</th>
                        <th className="px-4 py-3 font-medium">Resource</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {entries.map((entry) => (
                        <tr
                            key={entry.id}
                            className={
                                onSelect
                                    ? "cursor-pointer hover:bg-(--card-70)/70"
                                    : "hover:bg-(--card-70)/70"
                            }
                            onClick={() => onSelect?.(entry.id)}
                        >
                            <td className="px-4 py-3">
                                <span
                                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${actionBadgeClass(entry.action)}`}
                                >
                                    {entry.action}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <p className="font-medium">{entry.resource_type}</p>
                                <p className="font-mono text-xs text-(--ink-muted)">
                                    {entry.resource_id}
                                </p>
                            </td>
                            <td className="px-4 py-3 text-(--ink-muted)">
                                {entry.reconciliation_status ?? "-"}
                            </td>
                            <td className="px-4 py-3 text-(--ink-muted)">
                                {new Date(entry.created_at).toLocaleString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============================================================================
// Variant: admin — full columns incl. user + status badge + empty state
// ============================================================================

function AdminAuditLogTable({ entries }: { entries: AuditEntry[] }) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                    <tr>
                        <th className="px-6 py-4 font-medium">Timestamp</th>
                        <th className="px-6 py-4 font-medium">Action</th>
                        <th className="px-6 py-4 font-medium">Resource</th>
                        <th className="px-6 py-4 font-medium">User</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium">Description</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-(--card-70)/50">
                            <td className="px-6 py-4 text-(--ink-muted)">
                                {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs">{entry.action}</td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium">
                                        {entry.resource_type}
                                    </span>
                                    <span className="font-mono text-xs text-(--ink-muted)">
                                        {entry.resource_id}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-(--ink-muted)">
                                {entry.user_id ?? "System"}
                            </td>
                            <td className="px-6 py-4">
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        entry.status === "success"
                                            ? "bg-(--positive)/12 text-(--positive)"
                                            : "bg-(--negative)/12 text-(--negative)"
                                    }`}
                                >
                                    {entry.status ?? "-"}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-(--ink-muted)">
                                {entry.description ?? "-"}
                            </td>
                        </tr>
                    ))}
                    {entries.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-(--ink-muted)">
                                No audit logs found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ============================================================================
// Public API — single configurable component
// ============================================================================

type AuditLogTableProps =
    | {
          variant: "admin";
          entries: AuditEntry[];
          onSelect?: never;
      }
    | {
          variant: "billing";
          entries: AuditEntry[];
          onSelect?: (id: string) => void;
      };

export function AuditLogTable({ variant, entries, onSelect }: AuditLogTableProps) {
    if (variant === "billing") {
        return <BillingAuditLogTable entries={entries} onSelect={onSelect} />;
    }
    return <AdminAuditLogTable entries={entries} />;
}
