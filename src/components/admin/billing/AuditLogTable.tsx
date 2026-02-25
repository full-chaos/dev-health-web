"use client";

import type { BillingAuditEntry } from "@/app/(app)/superadmin/billing/audit/actions";

type AuditLogTableProps = {
  entries: BillingAuditEntry[];
  onSelect: (entryId: string) => void;
};

const actionColor: Record<string, string> = {
  plan: "bg-blue-500/15 text-blue-400",
  subscription: "bg-green-500/15 text-green-400",
  invoice: "bg-yellow-500/15 text-yellow-400",
  refund: "bg-orange-500/15 text-orange-400",
  reconciliation: "bg-purple-500/15 text-purple-400",
};

function actionBadgeClass(action: string): string {
  const group = action.split(".", 1)[0];
  return actionColor[group] ?? "bg-slate-500/15 text-slate-300";
}

export function AuditLogTable({ entries, onSelect }: AuditLogTableProps) {
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
              className="cursor-pointer hover:bg-(--card-70)/70"
              onClick={() => onSelect(entry.id)}
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
                <p className="font-mono text-xs text-(--ink-muted)">{entry.resource_id}</p>
              </td>
              <td className="px-4 py-3 text-(--ink-muted)">{entry.reconciliation_status ?? "-"}</td>
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
