"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { RefreshControl } from "@/components/admin/RefreshControl";
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
    const router = useRouter();
    const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(new Set());
    const [isRefreshing, startRefresh] = useTransition();
    const rows = useMemo(
        () => buildSyncConfigTableRows(configs, expandedGroupIds),
        [configs, expandedGroupIds],
    );

    // `configs` is a fresh array from the server on every render this
    // component receives new props for (including after router.refresh()).
    // Re-synced synchronously during render when the reference changes — the
    // documented React pattern for resetting state from props (mirrors
    // BackfillStatus's `backfillJobSyncKey`) — so this needs neither a
    // useEffect (react-hooks/set-state-in-effect) nor a memo with an
    // "unused" dependency.
    const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date().toISOString());
    const [syncedConfigs, setSyncedConfigs] = useState(configs);
    if (configs !== syncedConfigs) {
        setSyncedConfigs(configs);
        setLastUpdatedAt(new Date().toISOString());
    }

    function toggleGroup(configId: string) {
        setExpandedGroupIds((current) => {
            const next = new Set(current);
            if (next.has(configId)) next.delete(configId);
            else next.add(configId);
            return next;
        });
    }

    function handleRefresh() {
        startRefresh(() => {
            router.refresh();
        });
    }

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <RefreshControl
                    onRefresh={handleRefresh}
                    lastUpdatedAt={lastUpdatedAt}
                    isRefreshing={isRefreshing}
                />
            </div>
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
        </div>
    );
}
