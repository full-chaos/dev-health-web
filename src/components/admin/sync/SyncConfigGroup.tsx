"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SyncConfig } from "@/lib/admin/types";
import { deleteSyncConfig } from "@/lib/admin/server";
import { SyncConfigCard } from "./SyncConfigCard";
import { SyncStatusBadge } from "./SyncStatusBadge";

type SyncConfigGroupProps = {
    parent: SyncConfig;
    childConfigs: SyncConfig[];
};

export function SyncConfigGroup({ parent, childConfigs }: SyncConfigGroupProps) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const successCount = childConfigs.filter((c) => c.last_sync_success === true).length;
    const failedCount = childConfigs.filter((c) => c.last_sync_success === false).length;
    const pendingCount = childConfigs.filter((c) => c.last_sync_at === null).length;

    const groupStatus = failedCount > 0 ? "failed" : successCount > 0 ? "success" : "never";

    const handleDelete = () => {
        startTransition(async () => {
            try {
                const result = await deleteSyncConfig(parent.id);
                if (result.error) {
                    toast.error(result.error);
                    setShowDeleteConfirm(false);
                } else {
                    toast.success("Group deleted");
                    router.refresh();
                }
            } catch {
                toast.error("Failed to delete sync config group");
                setShowDeleteConfirm(false);
            }
        });
    };

    return (
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) overflow-hidden">
            {/* Parent header — expand/collapse via a stretched button so the
                action cluster can hold real buttons (no nested interactives) */}
            <div className="relative flex items-start justify-between p-6 hover:bg-(--card-70) transition-colors">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="space-y-1 text-left"
                >
                    {/* Stretch the click target across the full header row */}
                    <span aria-hidden className="absolute inset-0" />
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{parent.name}</h3>
                        <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2 py-0.5 text-xs text-(--ink-muted)">
                            {childConfigs.length} repo{childConfigs.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-(--ink-muted)">
                        <span className="capitalize">{parent.provider}</span>
                        {typeof parent.sync_options?.owner === "string" && (
                            <>
                                <span>•</span>
                                <span>{parent.sync_options.owner}</span>
                            </>
                        )}
                        {successCount > 0 && (
                            <>
                                <span>•</span>
                                <span className="text-green-500">{successCount} ok</span>
                            </>
                        )}
                        {failedCount > 0 && (
                            <>
                                <span>•</span>
                                <span className="text-red-500">{failedCount} failed</span>
                            </>
                        )}
                        {pendingCount > 0 && (
                            <>
                                <span>•</span>
                                <span>{pendingCount} pending</span>
                            </>
                        )}
                    </div>
                </button>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    {/* Lifted above the stretched expand target so clicks here
                        never toggle expansion */}
                    <div className="relative z-10 flex items-center gap-2">
                        {showDeleteConfirm ? (
                            <>
                                <span className="text-xs text-red-500">
                                    Delete group and {childConfigs.length} repo config
                                    {childConfigs.length !== 1 ? "s" : ""}?
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete();
                                    }}
                                    disabled={isPending}
                                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                    Yes, Delete
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDeleteConfirm(false);
                                    }}
                                    disabled={isPending}
                                    className="rounded-md border border-(--card-stroke) bg-(--card-70) px-2 py-1 text-xs font-medium text-foreground hover:border-(--accent) hover:text-(--accent)"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDeleteConfirm(true);
                                }}
                                disabled={isPending}
                                className="rounded-md bg-(--card-70) px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <SyncStatusBadge status={groupStatus} />
                    <span className="text-(--ink-muted) text-sm">{expanded ? "▲" : "▼"}</span>
                </div>
            </div>

            {/* Children */}
            {expanded && (
                <div className="grid gap-4 border-t border-(--card-stroke) p-4 xl:grid-cols-2">
                    {childConfigs.map((child) => (
                        <SyncConfigCard key={child.id} config={child} />
                    ))}
                </div>
            )}
        </div>
    );
}
