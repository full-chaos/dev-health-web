"use client";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import type { SyncStatus } from "@/lib/sync-types";

export type ConnectorFailure = {
  occurredAt: string;
  message: string;
  stage?: string | null;
};

export type ConnectorStatusItem = {
  provider: string;
  scope: string;
  lastSyncAt?: string | null;
  rowsIngested: number;
  lastFailure?: ConnectorFailure | null;
};

type ConnectorStatusTableProps = {
  data: ConnectorStatusItem[];
  isPending?: boolean;
};

export function ConnectorStatusTable({ data, isPending }: ConnectorStatusTableProps) {
  const columns: DataTableColumn<ConnectorStatusItem>[] = [
    {
      key: "provider",
      header: "Provider",
      render: (row) => <span className="font-medium text-foreground">{row.provider}</span>,
    },
    {
      key: "scope",
      header: "Scope",
      render: (row) => <span className="text-sm text-(--ink-muted)">{row.scope}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status: SyncStatus = row.lastFailure
          ? "failed"
          : row.lastSyncAt
            ? "success"
            : "never";
        return <SyncStatusBadge status={status} />;
      },
    },
    {
      key: "lastSyncAt",
      header: "Last Sync",
      render: (row) => (
        <span className="text-sm text-(--ink-muted)">
          {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString() : "Never"}
        </span>
      ),
    },
    {
      key: "rowsIngested",
      header: "Rows Ingested",
      render: (row) => <span className="text-sm text-(--ink-muted)">{row.rowsIngested}</span>,
    },
    {
      key: "message",
      header: "Message",
      render: (row) => (
        <span
          className="text-sm text-(--ink-muted) truncate max-w-xs block"
          title={row.lastFailure?.message ?? ""}
        >
          {row.lastFailure ? row.lastFailure.message : "-"}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      rowKeyAction={(row) => `${row.provider}-${row.scope}`}
      emptyMessage="No connectors found."
      isPending={isPending}
    />
  );
}
