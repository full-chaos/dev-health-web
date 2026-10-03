import { CircleCheck, CircleHelp, Loader, Minus, TriangleAlert } from "lucide-react";

import { STATUS_PILL } from "@/lib/statusPill";
import { SyncStatus } from "@/lib/sync-types";

interface SyncStatusBadgeProps {
    status: SyncStatus;
    className?: string;
    label?: string;
}

export function SyncStatusBadge({ status, className = "", label }: SyncStatusBadgeProps) {
    const variants = {
        success: STATUS_PILL.positive,
        failed: STATUS_PILL.negative,
        running: `${STATUS_PILL.info} animate-pulse`,
        idle: STATUS_PILL.muted,
        never: STATUS_PILL.muted,
    };

    const icons = {
        success: CircleCheck,
        failed: TriangleAlert,
        running: Loader,
        idle: Minus,
        never: CircleHelp,
    };
    const Icon = icons[status];

    const labels = {
        success: "Success",
        failed: "Failed",
        running: "Syncing...",
        idle: "Idle",
        never: "Never Synced",
    };

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${variants[status]} ${className}`}
        >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label ?? labels[status]}
        </span>
    );
}
