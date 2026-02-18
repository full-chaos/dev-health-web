import React from "react";
import type { AuditLog } from "@/lib/admin/types";

type AuditLogTableProps = {
  logs: AuditLog[];
};

export function AuditLogTable({ logs }: AuditLogTableProps) {
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
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 text-(--ink-muted)">
                {new Date(log.created_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 font-mono text-xs">{log.action}</td>
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-xs font-medium">{log.resource_type}</span>
                  <span className="font-mono text-[10px] text-(--ink-muted)">
                    {log.resource_id}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-xs text-(--ink-muted)">
                {log.user_id || "System"}
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    log.status === "success"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {log.status}
                </span>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{log.description || "-"}</td>
            </tr>
          ))}
          {logs.length === 0 && (
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
