"use client";

import { useEffect } from "react";
import Link from "next/link";
import { formatTimestamp } from "@/lib/formatters";
import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

const STORAGE_KEY = "dev-health-last-ingested";

type DataStatusBannerProps = {
  isUnavailable: boolean;
  lastIngestedAt: string | null;
  coverageLow: boolean;
  filters?: MetricFilter;
};

export function DataStatusBanner({
  isUnavailable,
  lastIngestedAt,
  coverageLow,
  filters,
}: DataStatusBannerProps) {
  const cachedAt =
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);

  useEffect(() => {
    if (lastIngestedAt) {
      localStorage.setItem(STORAGE_KEY, lastIngestedAt);
    }
  }, [lastIngestedAt]);

  if (!isUnavailable && !coverageLow) {
    return null;
  }

  const exploreHref = filters
    ? buildExploreUrl({ api: "/api/v1/home", filters })
    : "/explore?api=/api/v1/home";

  return (
    <div className="rounded-3xl border border-dashed border-amber-400/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isUnavailable ? (
          <p>
            Data unavailable. Last cached: {formatTimestamp(lastIngestedAt ?? cachedAt)}.
          </p>
        ) : (
          <p>
            Coverage is low. Trend confidence may be degraded for the current
            window.
          </p>
        )}
        <Link
          href={exploreHref}
          className="text-xs uppercase tracking-[0.2em] text-amber-900 underline"
        >
          View evidence
        </Link>
      </div>
    </div>
  );
}
