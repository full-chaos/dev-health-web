"use client";

import { useEffect, useState } from "react";
import { formatTimestamp } from "@/lib/formatters";

const STORAGE_KEY = "dev-health-last-ingested";

type DataStatusBannerProps = {
  isUnavailable: boolean;
  lastIngestedAt: string | null;
  coverageLow: boolean;
};

export function DataStatusBanner({
  isUnavailable,
  lastIngestedAt,
  coverageLow,
}: DataStatusBannerProps) {
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  useEffect(() => {
    if (lastIngestedAt) {
      localStorage.setItem(STORAGE_KEY, lastIngestedAt);
      setCachedAt(lastIngestedAt);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCachedAt(stored);
    }
  }, [lastIngestedAt]);

  if (!isUnavailable && !coverageLow) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-dashed border-amber-400/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
      {isUnavailable ? (
        <p>
          Data unavailable. Last cached: {formatTimestamp(cachedAt)}.
        </p>
      ) : (
        <p>
          Coverage is low. Trend confidence may be degraded for the current
          window.
        </p>
      )}
    </div>
  );
}
