"use client";

import { useState } from "react";
import { SyncConfig } from "@/lib/admin/types";
import { SyncConfigCard } from "./SyncConfigCard";
import { SyncStatusBadge } from "./SyncStatusBadge";

type SyncConfigGroupProps = {
    parent: SyncConfig;
    childConfigs: SyncConfig[];
};

export function SyncConfigGroup({ parent, childConfigs }: SyncConfigGroupProps) {
    const [expanded, setExpanded] = useState(false);

    const successCount = childConfigs.filter((c) => c.last_sync_success === true).length;
    const failedCount = childConfigs.filter((c) => c.last_sync_success === false).length;
    const pendingCount = childConfigs.filter((c) => c.last_sync_at === null).length;

    const groupStatus = failedCount > 0 ? "failed" : successCount > 0 ? "success" : "never";

    return (
        <div className="rounded-xl border border-(--border) bg-(--card-80) overflow-hidden">
            {/* Parent header — clickable to expand/collapse */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-start justify-between p-6 text-left hover:bg-(--card-70) transition-colors"
            >
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{parent.name}</h3>
                        <span className="rounded-full border border-(--border) bg-(--card-70) px-2 py-0.5 text-xs text-(--ink-muted)">
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
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <SyncStatusBadge status={groupStatus} />
                    <span className="text-(--ink-muted) text-sm">{expanded ? "▲" : "▼"}</span>
                </div>
            </button>

            {/* Children */}
            {expanded && (
                <div className="border-t border-(--border) p-4 grid gap-4 md:grid-cols-2">
                    {childConfigs.map((child) => (
                        <SyncConfigCard key={child.id} config={child} />
                    ))}
                </div>
            )}
        </div>
    );
}
