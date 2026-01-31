"use client";

import Link from "next/link";
import { SyncConfig } from "@/lib/sync-types";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface SyncConfigCardProps {
  config: SyncConfig;
}

export function SyncConfigCard({ config }: SyncConfigCardProps) {
  const handleSync = (e: React.MouseEvent) => {
    e.preventDefault();
    // Mock sync trigger
    console.log(`Triggering sync for ${config.id}`);
    alert(`Sync triggered for ${config.name}`);
  };

  return (
    <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6 transition-all hover:border-(--card-stroke-hover)">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-foreground">
            <Link href={`/admin/sync/${config.id}`} className="hover:underline">
              {config.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-(--ink-muted) capitalize">
            Provider: {config.provider}
          </p>
        </div>
        <SyncStatusBadge status={config.status} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-(--card-stroke) pt-4">
        <div className="text-xs text-(--ink-muted)">
          Last sync: {config.last_sync_at ? new Date(config.last_sync_at).toLocaleString() : "Never"}
        </div>
        <button
          onClick={handleSync}
          className="rounded-md bg-(--accent) px-3 py-1.5 text-xs font-medium text-white hover:bg-(--accent-hover) focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
        >
          Sync Now
        </button>
      </div>
    </div>
  );
}
