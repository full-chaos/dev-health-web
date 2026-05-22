"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { triggerBackfill, getBackfillJobStatus } from "@/lib/admin/server";
import type { BackfillJob } from "@/lib/admin/types";

interface RunBackfillProps {
  configId: string;
}

export function RunBackfill({ configId }: RunBackfillProps) {
  const [isPending, startTransition] = useTransition();
  const [since, setSince] = useState("");
  const [before, setBefore] = useState("");
  const [activeJob, setActiveJob] = useState<BackfillJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollJobStatus = useCallback(
    (jobId: string) => {
      stopPolling();
      pollingRef.current = setInterval(async () => {
        const result = await getBackfillJobStatus(jobId);
        if (result.error) {
          stopPolling();
          return;
        }
        if (result.data) {
          setActiveJob(result.data);
          if (result.data.status === "completed") {
            stopPolling();
            toast.success("Backfill completed successfully");
          } else if (result.data.status === "failed") {
            stopPolling();
            toast.error(result.data.error_message || "Backfill failed");
          }
        }
      }, 3000);
    },
    [stopPolling],
  );

  const handleBackfill = () => {
    if (!since || !before) {
      toast.error("Please select both dates");
      return;
    }

    startTransition(async () => {
      try {
        const result = await triggerBackfill(configId, since, before);
        if (result.error) {
          toast.error(result.error);
        } else if (result.data?.backfill_job_id) {
          toast.success("Backfill triggered");
          setActiveJob({
            id: result.data.backfill_job_id,
            sync_config_id: configId,
            status: "pending",
            since_date: since,
            before_date: before,
            total_chunks: 0,
            completed_chunks: 0,
            failed_chunks: 0,
            progress_pct: 0,
            error_message: null,
            started_at: null,
            completed_at: null,
            created_at: new Date().toISOString(),
          });
          pollJobStatus(result.data.backfill_job_id);
        }
      } catch {
        toast.error("An error occurred while triggering backfill");
      }
    });
  };

  const isTerminal = activeJob?.status === "completed" || activeJob?.status === "failed";

  return (
    <div className="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6 mt-6">
      <div>
        <h3 className="text-sm font-medium">Run Historical Backfill</h3>
        <p className="mt-1 text-xs text-(--ink-muted)">
          Pull historical data for a specific date range. This runs in the background.
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-(--ink-muted)">From</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-(--ink-muted)">To</label>
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleBackfill}
          disabled={isPending || !since || !before || (!!activeJob && !isTerminal)}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isPending ? "Starting..." : "Run Backfill"}
        </button>
      </div>

      {/* Progress section */}
      {activeJob && (
        <div className="space-y-2 pt-2 border-t border-(--card-stroke)">
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--ink-muted)">
              {activeJob.status === "pending" && "Waiting to start..."}
              {activeJob.status === "running" &&
                `Processing chunk ${activeJob.completed_chunks} of ${activeJob.total_chunks}`}
              {activeJob.status === "completed" && "Backfill complete"}
              {activeJob.status === "failed" && (activeJob.error_message || "Backfill failed")}
            </span>
            <span className="font-medium tabular-nums">{Math.round(activeJob.progress_pct)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-stroke)">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeJob.status === "failed"
                  ? "bg-red-500"
                  : activeJob.status === "completed"
                    ? "bg-green-500"
                    : "bg-(--accent)"
              }`}
              style={{
                width: `${Math.max(activeJob.progress_pct, activeJob.status === "pending" ? 2 : 0)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
