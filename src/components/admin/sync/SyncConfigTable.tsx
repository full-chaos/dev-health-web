"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import type { SyncConfig } from "@/lib/admin/types";
import { SyncConfigTableRow } from "./SyncConfigTableRow";
import {
    buildSyncConfigTableRows,
    type SyncConfigTableRow as SyncConfigTableRowData,
} from "./syncConfigTableModel";

type SyncConfigTableProps = {
    readonly configs: readonly SyncConfig[];
};

const COLUMNS = [
    { key: "configuration", header: "Configuration", render: () => null },
    { key: "provider", header: "Provider", render: () => null },
    { key: "state", header: "State", render: () => null },
    { key: "status", header: "Sync status", render: () => null },
    { key: "lastSync", header: "Last sync", render: () => null },
    {
        key: "actions",
        header: "Actions",
        headerClassName: "px-4 py-3 text-right font-medium",
        render: () => null,
    },
] satisfies readonly DataTableColumn<SyncConfigTableRowData>[];

export function SyncConfigTable({ configs }: SyncConfigTableProps) {
    const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(new Set());
    const rows = useMemo(
        () => buildSyncConfigTableRows(configs, expandedGroupIds),
        [configs, expandedGroupIds],
    );

    function toggleGroup(configId: string) {
        setExpandedGroupIds((current) => {
            const next = new Set(current);
            if (next.has(configId)) next.delete(configId);
            else next.add(configId);
            return next;
        });
    }

    return (
        <DataTable
            accessibleLabel="Sync configurations"
            columns={COLUMNS}
            data={rows}
            rowKeyAction={(row) => row.config.id}
            renderRowAction={(row) => (
                <SyncConfigTableRow
                    row={row}
                    expanded={expandedGroupIds.has(row.config.id)}
                    onToggleGroupAction={toggleGroup}
                />
            )}
            emptyMessage="No sync configurations found. Create a new configuration to get started."
        />
    );
}
