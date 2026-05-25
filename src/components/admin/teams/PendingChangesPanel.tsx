"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getPendingTeamChanges, approveTeamChanges, dismissTeamChanges } from "@/lib/admin/server";
import type { FlaggedChange } from "@/lib/admin/types";

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export function PendingChangesPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [changes, setChanges] = useState<FlaggedChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const loadChanges = useCallback(async () => {
    setLoading(true);
    const result = await getPendingTeamChanges();
    if (result.error) {
      toast.error("Failed to load pending changes: " + result.error);
    } else if (result.data) {
      setChanges(result.data.changes);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadChanges coordinates async loading state after mount.
    loadChanges();
  }, [loadChanges]);

  const handleApprove = (teamId: string, changeIndex: number) => {
    startTransition(async () => {
      const result = await approveTeamChanges(teamId, [changeIndex]);
      if (result.error) {
        toast.error("Failed to approve change: " + result.error);
      } else {
        toast.success("Change approved");
        loadChanges();
        router.refresh();
      }
    });
  };

  const handleDismiss = (teamId: string, changeIndex: number) => {
    startTransition(async () => {
      const result = await dismissTeamChanges(teamId, [changeIndex]);
      if (result.error) {
        toast.error("Failed to dismiss change: " + result.error);
      } else {
        toast.success("Change dismissed");
        loadChanges();
        router.refresh();
      }
    });
  };

  const handleBulkAction = (action: "approve" | "dismiss") => {
    const uniqueTeamIds = Array.from(new Set(changes.map((c) => c.team_id)));
    const fn = action === "approve" ? approveTeamChanges : dismissTeamChanges;

    startTransition(async () => {
      let successCount = 0;
      let errorCount = 0;

      await Promise.all(
        uniqueTeamIds.map(async (teamId) => {
          const result = await fn(teamId, undefined, true);
          if (result.error) errorCount++;
          else successCount++;
        }),
      );

      if (errorCount > 0) {
        toast.error(`Failed to ${action} changes for ${errorCount} teams`);
      }
      if (successCount > 0) {
        toast.success(
          `${action === "approve" ? "Approved" : "Dismissed"} changes for ${successCount} teams`,
        );
      }

      loadChanges();
      router.refresh();
    });
  };

  if (loading && changes.length === 0) {
    return null;
  }

  if (changes.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-(--card-stroke) bg-(--card)">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">Pending Changes</h3>
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
            {changes.length}
          </span>
        </div>
        <span className="text-(--ink-muted)">{isOpen ? "▼" : "▶"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-(--card-stroke)">
          <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-(--card-stroke) bg-(--card-80)">
            <button
              type="button"
              onClick={() => handleBulkAction("approve")}
              disabled={isPending}
              className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/10 disabled:opacity-50"
            >
              Approve All
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction("dismiss")}
              disabled={isPending}
              className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              Dismiss All
            </button>
          </div>

          {changes.map((change) => (
            <div
              key={`${change.team_id}-${change.change_type}-${change.field ?? "all"}-${change.change_index}`}
              className="flex items-center justify-between border-b border-(--card-stroke) px-4 py-3 last:border-0 hover:bg-(--card-70)"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{change.team_name}</span>
                  {change.change_type === "field_changed" && (
                    <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs font-medium text-yellow-600">
                      Field Changed
                    </span>
                  )}
                  {change.change_type === "provider_removed" && (
                    <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-600">
                      Provider Removed
                    </span>
                  )}
                  {change.change_type === "new_team_available" && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-600">
                      New Team
                    </span>
                  )}
                  <span className="text-xs text-(--ink-muted)">
                    {formatRelativeTime(change.discovered_at)}
                  </span>
                </div>

                <div className="text-sm text-(--ink-muted)">
                  {change.change_type === "field_changed" && (
                    <span>
                      {change.field}:{" "}
                      <span className="line-through">{String(change.old_value)}</span> →{" "}
                      <span className="text-foreground">{String(change.new_value)}</span>
                    </span>
                  )}
                  {change.change_type === "provider_removed" && (
                    <span>Team no longer found in provider</span>
                  )}
                  {change.change_type === "new_team_available" && (
                    <span>New team discovered: {change.team_name}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(change.team_id, change.change_index)}
                  disabled={isPending}
                  className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/10 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(change.team_id, change.change_index)}
                  disabled={isPending}
                  className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
