import type { CustomerPushBatchStatus } from "@/lib/admin/types";

interface CustomerPushStatusBadgeProps {
    status: CustomerPushBatchStatus;
    className?: string;
}

// Mirrors SyncStatusBadge's variant/label shape (CHAOS-2714 D11) for the
// pinned batch status vocabulary (CC12): accepted -> (stream_unavailable) ->
// processing -> completed | partial | failed.
const VARIANTS: Record<CustomerPushBatchStatus, string> = {
    accepted: "bg-blue-100 text-blue-700 border-blue-200",
    stream_unavailable: "bg-orange-100 text-orange-700 border-orange-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
    completed: "bg-green-100 text-green-700 border-green-200",
    partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
    failed: "bg-red-100 text-red-700 border-red-200",
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
