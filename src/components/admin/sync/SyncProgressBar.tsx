"use client";

import { useSyncProgress } from "@/lib/graphql/hooks/useSubscription";
import { useEffect, useState } from "react";

interface SyncProgressBarProps {
  configId: string;
  provider: string;
  orgId: string;
}

export function SyncProgressBar({ provider, orgId }: SyncProgressBarProps) {
  const [progress, setProgress] = useState<{
    itemsProcessed: number;
    itemsTotal: number;
    message?: string;
    status: string;
  } | null>(null);

  useSyncProgress({
    orgId,
    onUpdate: (data) => {
      // Filter updates for this provider
      // Note: The subscription currently returns updates by provider, not configId.
      // This assumes one active sync per provider per org, which is a reasonable simplification for now.
      if (data.provider === provider) {
        setProgress({
          itemsProcessed: data.itemsProcessed,
          itemsTotal: data.itemsTotal,
          message: data.message,
          status: data.status,
        });
      }
    },
  });

  // Reset progress when status changes to something terminal, but keep showing it for a moment
  useEffect(() => {
    if (progress?.status === "SUCCESS" || progress?.status === "FAILED") {
      const timer = setTimeout(() => {
        setProgress(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [progress?.status]);

  if (!progress || progress.status === "IDLE" || progress.status === "PENDING") {
    return null;
  }

  const percentage =
    progress.itemsTotal > 0
      ? Math.min(100, Math.round((progress.itemsProcessed / progress.itemsTotal) * 100))
      : 0;

  return (
    <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          {progress.status === "RUNNING" ? "Syncing..." : progress.status}
        </span>
        <span className="text-(--ink-muted)">
          {progress.itemsProcessed} / {progress.itemsTotal} ({percentage}%)
        </span>
      </div>
      
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-70)">
        <div
          className="h-full bg-(--accent) transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {progress.message && (
        <p className="mt-2 text-xs text-(--ink-muted)">{progress.message}</p>
      )}
    </div>
  );
}
