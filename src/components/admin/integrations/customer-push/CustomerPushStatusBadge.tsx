import { STATUS_PILL } from "@/lib/statusPill";
import type { CustomerPushBatchStatus } from "@/lib/admin/types";

interface CustomerPushStatusBadgeProps {
    status: CustomerPushBatchStatus;
    className?: string;
}

// Mirrors SyncStatusBadge's variant/label shape (CHAOS-2714 D11) for the
// pinned batch status vocabulary (CC12): accepted -> (stream_unavailable) ->
// processing -> completed | partial | failed.
const VARIANTS: Record<CustomerPushBatchStatus, string> = {
    accepted: STATUS_PILL.info,
    stream_unavailable: STATUS_PILL.caution,
    processing: `${STATUS_PILL.info} animate-pulse`,
    completed: STATUS_PILL.positive,
    partial: STATUS_PILL.caution,
    failed: STATUS_PILL.negative,
};

const LABELS: Record<CustomerPushBatchStatus, string> = {
    accepted: "Accepted",
    stream_unavailable: "Stream unavailable",
    processing: "Processing…",
    completed: "Completed",
    partial: "Partial",
    failed: "Failed",
};

export function CustomerPushStatusBadge({ status, className = "" }: CustomerPushStatusBadgeProps) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${VARIANTS[status]} ${className}`}
        >
            {LABELS[status]}
        </span>
    );
}
