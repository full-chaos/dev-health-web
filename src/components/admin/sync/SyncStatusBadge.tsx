import { SyncStatus } from "@/lib/sync-types";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

export function SyncStatusBadge({ status, className = "" }: SyncStatusBadgeProps) {
  const variants = {
    success: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    running: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse",
    idle: "bg-gray-100 text-gray-700 border-gray-200",
    never: "bg-gray-50 text-gray-500 border-gray-200",
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
      {labels[status]}
    </span>
  );
}
