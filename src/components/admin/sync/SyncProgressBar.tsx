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
    stage?: string;
    currentStep?: string;
  } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useSyncProgress({
    orgId,
    onUpdate: (data) => {
      // Filter updates for this provider
      // Note: The subscription currently returns updates by provider, not configId.
      // This assumes one active sync per provider per org, which is a reasonable simplification for now.
      if (data.provider === provider) {
        const update = data as typeof data & { stage?: string; current_step?: string };
        const newStatus = data.status;
        if (newStatus === "RUNNING") {
          setStartedAt((prev) => prev ?? Date.now());
        } else if (newStatus !== "RUNNING" && newStatus !== "PENDING") {
          setStartedAt(null);
        }
        setProgress({
          itemsProcessed: data.itemsProcessed,
          itemsTotal: data.itemsTotal,
          message: data.message,
          status: data.status,
          stage: update.stage,
          currentStep: update.current_step,
        });
      }
    },
  });

  useEffect(() => {
    if (progress?.status !== "RUNNING") {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [progress?.status]);

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
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedRemainderSeconds = elapsedSeconds % 60;
  const elapsedText = `${String(elapsedMinutes).padStart(2, "0")}:${String(elapsedRemainderSeconds).padStart(2, "0")}`;

  const hasEtaData =
    progress.itemsProcessed >= 2 &&
    elapsedSeconds > 0 &&
    progress.itemsTotal > progress.itemsProcessed;
  const estimatedSecondsRemaining = hasEtaData
    ? Math.max(
        0,
        Math.round(
          (progress.itemsTotal - progress.itemsProcessed) *
            (elapsedSeconds / progress.itemsProcessed),
        ),
      )
    : null;
  const etaMinutes = estimatedSecondsRemaining ? Math.floor(estimatedSecondsRemaining / 60) : 0;
  const etaSeconds = estimatedSecondsRemaining ? estimatedSecondsRemaining % 60 : 0;
  const etaText =
    estimatedSecondsRemaining === null
      ? "Calculating..."
      : `~${etaMinutes}m ${etaSeconds}s remaining`;

  const stageLabel = progress.stage || progress.currentStep || `${percentage}% complete`;

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

      <div className="mt-2 flex items-center justify-between text-xs text-(--ink-muted)">
        <span>
          Elapsed {elapsedText} - {stageLabel}
        </span>
        <span>{etaText}</span>
      </div>

      {progress.message && <p className="mt-2 text-xs text-(--ink-muted)">{progress.message}</p>}
    </div>
  );
}
