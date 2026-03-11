"use client";

import React, { useState, useTransition } from "react";
import { toast } from "sonner";
import { triggerBackfill } from "@/lib/admin/server";

interface RunBackfillProps {
  configId: string;
}

export function RunBackfill({ configId }: RunBackfillProps) {
  const [isPending, startTransition] = useTransition();
  const [since, setSince] = useState("");
  const [before, setBefore] = useState("");

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
        } else {
          toast.success("Backfill triggered successfully");
        }
      } catch {
        toast.error("An error occurred while triggering backfill");
      }
    });
  };

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
          disabled={isPending || !since || !before}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isPending ? "Running..." : "Run Backfill"}
        </button>
      </div>
    </div>
  );
}
