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

    const labels = {
        success: "Success",
        failed: "Failed",
        running: "Syncing...",
        idle: "Idle",
        never: "Never Synced",
    };

    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[status]} ${className}`}
        >
            {label ?? labels[status]}
        </span>
    );
}
