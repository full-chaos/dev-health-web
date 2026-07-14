"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { toggleSyncActive } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { SyncConfigDeleteControls } from "./SyncConfigDeleteControls";
import {
    groupStatus,
    latestSyncAt,
    persistedStatus,
    providerLabel,
    type SyncConfigTableRow as SyncConfigTableRowData,
} from "./syncConfigTableModel";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { useSyncTrigger } from "./useSyncTrigger";

type SyncConfigTableRowProps = {
    readonly row: SyncConfigTableRowData;
    readonly expanded: boolean;
    readonly onToggleGroupAction: (configId: string) => void;
};

function GroupTableRow({ row, expanded, onToggleGroupAction }: SyncConfigTableRowProps) {
    const owner =
        typeof row.config.sync_options.owner === "string" ? row.config.sync_options.owner : null;
    const childCount = row.childConfigs.length;
    const successCount = row.childConfigs.filter(
        (config) => config.last_sync_success === true,
    ).length;
    const failedCount = row.childConfigs.filter(
        (config) => config.last_sync_success === false,
    ).length;
    const pendingCount = row.childConfigs.filter((config) => config.last_sync_at === null).length;
    const confirmMessage = `Delete ${row.config.name} group and ${childCount} repo config${childCount === 1 ? "" : "s"}?`;

    return (
        <tr className="transition-colors hover:bg-(--card-70)">
            <th scope="row" className="px-4 py-3 font-normal">
                <button
                    type="button"
                    onClick={() => onToggleGroupAction(row.config.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${row.config.name} group`}
                    className="flex items-center gap-3 text-left"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className={`h-4 w-4 shrink-0 text-(--ink-muted) transition-transform ${expanded ? "rotate-90" : ""}`}
                    >
                        <path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <span>
                        <span className="block font-medium text-foreground">{row.config.name}</span>
                        <span className="block text-xs text-(--ink-muted)">
                            {childCount} repo{childCount === 1 ? "" : "s"}
                            {owner ? ` · ${owner}` : ""}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                            {successCount > 0 ? (
                                <span className="text-(--positive)">{successCount} ok</span>
                            ) : null}
                            {failedCount > 0 ? (
                                <span className="text-(--negative)">{failedCount} failed</span>
                            ) : null}
                            {pendingCount > 0 ? <span>{pendingCount} pending</span> : null}
                        </span>
                    </span>
                </button>
            </th>
            <td className="px-4 py-3 text-(--ink-muted)">{providerLabel(row.config.provider)}</td>
            <td className="px-4 py-3 text-(--ink-muted)">Group</td>
            <td className="px-4 py-3">
                <SyncStatusBadge status={groupStatus(row.childConfigs)} />
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-(--ink-muted)">
                <ClientTimestamp value={latestSyncAt(row.childConfigs)} fallback="Never" />
            </td>
            <td className="px-4 py-3 text-right">
                <div className="flex min-w-max flex-col items-end gap-1">
                    <span className="max-w-40 truncate text-xs font-medium text-(--ink-muted) lg:hidden">
                        {row.config.name}
                    </span>
                    <SyncConfigDeleteControls
                        configId={row.config.id}
                        confirmMessage={confirmMessage}
                        successMessage="Group deleted"
                        targetName={`${row.config.name} group`}
                    />
                </div>
            </td>
        </tr>
    );
}

function ConfigTableRow({ row }: { readonly row: SyncConfigTableRowData }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isDeleteBusy, setIsDeleteBusy] = useState(false);
    const { liveStatus, isSyncing, trigger } = useSyncTrigger(row.config.id);
    const status = liveStatus ?? persistedStatus(row.config);
    const isRowBusy = isPending || isSyncing || isDeleteBusy;

    function handleToggleActive() {
        startTransition(async () => {
            try {
                const result = await toggleSyncActive(row.config.id, !row.config.is_active);
                if (result.error) {
                    toast.error(result.error);
                    return;
                }
                toast.success(row.config.is_active ? "Sync paused" : "Sync resumed");
                router.refresh();
            } catch (error) {
                if (!(error instanceof Error)) throw error;
                toast.error(error.message || "Failed to update sync configuration");
            }
        });
    }

    return (
        <tr className="transition-colors hover:bg-(--card-70)">
            <th scope="row" className="px-4 py-3 font-normal">
                <div className={row.kind === "child" ? "pl-7" : undefined}>
                    <Link
                        href={`/org/admin/sync/${row.config.id}`}
                        className="font-medium text-foreground hover:underline"
                    >
                        {row.config.name}
                    </Link>
                    {row.parentName ? (
                        <span className="block text-xs text-(--ink-muted)">
                            Part of {row.parentName}
                        </span>
                    ) : null}
                </div>
            </th>
            <td className="px-4 py-3 text-(--ink-muted)">{providerLabel(row.config.provider)}</td>
            <td className="px-4 py-3">
                <span
                    className={
                        row.config.is_active
                            ? "inline-flex rounded-full bg-(--positive)/10 px-2.5 py-0.5 text-xs font-medium text-(--positive)"
                            : "inline-flex rounded-full bg-(--card-70) px-2.5 py-0.5 text-xs font-medium text-(--ink-muted)"
                    }
                >
                    {row.config.is_active ? "Active" : "Paused"}
                </span>
            </td>
            <td className="px-4 py-3">
                <SyncStatusBadge status={status} />
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-(--ink-muted)">
                <ClientTimestamp value={row.config.last_sync_at} fallback="Never" />
            </td>
            <td className="px-4 py-3">
                <div className="flex min-w-max flex-col items-end gap-1">
                    <span className="max-w-40 truncate text-xs font-medium text-(--ink-muted) lg:hidden">
                        {row.config.name}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                            href={`/org/admin/sync/${encodeURIComponent(row.config.id)}`}
                            aria-label={`Manage ${row.config.name}`}
                            className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground hover:bg-(--card-70)"
                        >
                            {CTA_LABELS.manageSyncConfig}
                        </Link>
                        <button
                            type="button"
                            onClick={handleToggleActive}
                            disabled={isRowBusy}
                            aria-label={`${row.config.is_active ? "Pause" : "Resume"} ${row.config.name}`}
                            className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground hover:bg-(--card-70) disabled:opacity-50"
                        >
                            {row.config.is_active ? CTA_LABELS.pauseSync : CTA_LABELS.resumeSync}
                        </button>
                        <SyncConfigDeleteControls
                            configId={row.config.id}
                            confirmMessage={`Delete ${row.config.name}?`}
                            disabled={isPending || isSyncing}
                            onBusyChangeAction={setIsDeleteBusy}
                            successMessage="Config deleted"
                            targetName={row.config.name}
                        />
                        <button
                            type="button"
                            onClick={trigger}
                            disabled={isRowBusy}
                            aria-label={
                                isSyncing
                                    ? `Syncing ${row.config.name}`
                                    : `Sync ${row.config.name} now`
                            }
                            className="rounded-md bg-(--accent) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 active:opacity-70 disabled:opacity-50"
                        >
                            {isSyncing ? CTA_LABELS.syncing : CTA_LABELS.syncNow}
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    );
}

export function SyncConfigTableRow({
    row,
    expanded,
    onToggleGroupAction,
}: SyncConfigTableRowProps) {
    if (row.kind === "group") {
        return (
            <GroupTableRow
                row={row}
                expanded={expanded}
                onToggleGroupAction={onToggleGroupAction}
            />
        );
    }
    return <ConfigTableRow row={row} />;
}
