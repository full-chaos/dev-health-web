"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SyncConfig } from "@/lib/admin/types";
import { triggerSync, toggleSyncActive, deleteSyncConfig } from "@/lib/admin/server";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface SyncConfigCardProps {
  config: SyncConfig;
}

export function SyncConfigCard({ config }: SyncConfigCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleTrigger = async () => {
    startTransition(async () => {
      const result = await triggerSync(config.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Sync triggered successfully");
        router.refresh();
      }
    });
  };

  const handleToggleActive = async () => {
    startTransition(async () => {
      const result = await toggleSyncActive(config.id, !config.is_active);
      if (result.error) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteSyncConfig(config.id);
      if (result.error) {
        toast.error(result.error);
        setShowDeleteConfirm(false);
      } else {
        router.refresh();
      }
    });
  };

  const getStatus = () => {
    if (!config.last_sync_at) return "never";
    return config.last_sync_success ? "success" : "failed";
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
          <div className="mt-1 flex items-center gap-2 text-sm text-(--ink-muted)">
            <span className="capitalize">{config.provider}</span>
            <span>•</span>
            <span className={config.is_active ? "text-green-500" : "text-(--ink-muted)"}>
              {config.is_active ? "Active" : "Paused"}
            </span>
          </div>
        </div>
        <SyncStatusBadge status={getStatus()} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-(--card-stroke) pt-4">
        <div className="text-xs text-(--ink-muted)">
          Last sync:{" "}
          {config.last_sync_at ? new Date(config.last_sync_at).toLocaleString() : "Never"}
        </div>
        
        <div className="flex items-center gap-2">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500">Are you sure?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isPending}
                className="rounded-md bg-(--card-70) px-2 py-1 text-xs font-medium text-(--ink-muted) hover:bg-(--card-60)"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={isPending}
                className="rounded-md bg-(--card-70) px-3 py-1.5 text-xs font-medium text-(--ink-muted) hover:bg-(--card-60) disabled:opacity-50"
              >
                {config.is_active ? "Pause" : "Resume"}
              </button>
              
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
                className="rounded-md bg-(--card-70) px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                Delete
              </button>

              <button
                type="button"
                onClick={handleTrigger}
                disabled={isPending}
                className="rounded-md bg-(--accent) px-3 py-1.5 text-xs font-medium text-white hover:bg-(--accent-hover) focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 disabled:opacity-50"
              >
                {isPending ? "Syncing..." : "Sync Now"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
