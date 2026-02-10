"use client";

import type { MetaResponse } from "@/lib/types";
import { ClientTimestamp } from "@/components/ClientTimestamp";

type BackendBannerProps = {
  meta: MetaResponse | null;
};

export function BackendBanner({ meta }: BackendBannerProps) {
  if (!meta) {
    return null;
  }

  // Summarize coverage
  const coverageItems = Object.entries(meta.coverage)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .slice(0, 3);

  if (!meta.last_ingest_at && coverageItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs">
      {meta.last_ingest_at && (
        <>
          <span className="text-(--ink-muted)">•</span>
          <ClientTimestamp value={meta.last_ingest_at} prefix="Synced " className="text-(--ink-muted)" />
        </>
      )}
      {coverageItems.length > 0 && (
        <>
          <span className="text-(--ink-muted)">•</span>
          <span className="text-(--ink-muted)">
            {coverageItems.map(([k, v]) => `${v} ${k}`).join(", ")}
          </span>
        </>
      )}
    </div>
  );
}
