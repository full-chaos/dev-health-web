"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { getHeatmap } from "@/lib/api";
import type { HeatmapCell, HeatmapResponse } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";

import { HeatmapChart } from "./HeatmapChart";

type HeatmapRequest = {
  type: "temporal_load" | "context_switch" | "risk" | "individual";
  metric: string;
  scope_type: string;
  scope_id?: string;
  range_days: number;
  start_date?: string;
  end_date?: string;
};

type HeatmapPanelProps = {
  title: string;
  description: string;
  request: HeatmapRequest;
  initialData?: HeatmapResponse | null;
  emptyState?: string;
  evidenceTitle?: string;
};

const pickEvidenceLabel = (item: Record<string, unknown>, index: number) => {
  const candidates = [
    item.title,
    item.path,
    item.file_key,
    item.commit_hash,
    item.work_item_id,
    item.deployment_id,
    item.number,
    `Item ${index + 1}`,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate;
    }
  }
  if (typeof candidates[6] === "number") {
    return `#${candidates[6]}`;
  }
  return `Item ${index + 1}`;
};

const evidenceLink = (item: Record<string, unknown>) => {
  const repoId = typeof item.repo_id === "string" ? item.repo_id : null;
  const number = typeof item.number === "number" ? item.number : null;
  const workItemId = typeof item.work_item_id === "string" ? item.work_item_id : null;

  if (repoId && number !== null) {
    return `/prs/${repoId}:${number}`;
  }
  if (workItemId) {
    return `/issues/${workItemId}`;
  }
  return null;
};

export function HeatmapPanel({
  title,
  description,
  request,
  initialData,
  emptyState = "Heatmap data unavailable.",
  evidenceTitle = "Evidence",
}: HeatmapPanelProps) {
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const [evidence, setEvidence] = useState<Array<Record<string, unknown>>>(
    initialData?.evidence ?? []
  );
  const [loading, setLoading] = useState(false);

  const data = initialData;

  const handleCellSelect = useCallback(
    async (cell: HeatmapCell) => {
      setSelected(cell);
      setLoading(true);
      try {
        const response = await getHeatmap({
          ...request,
          x: cell.x,
          y: cell.y,
          limit: 50,
        });
        setEvidence(response.evidence ?? []);
      } catch {
        setEvidence([]);
      } finally {
        setLoading(false);
      }
    },
    [request]
  );

  const selectionLabel = useMemo(() => {
    if (!selected) {
      return null;
    }
    return `${selected.y} · ${selected.x}`;
  }, [selected]);

  if (!data || !data.axes?.x?.length || !data.axes?.y?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-5 text-sm text-[var(--ink-muted)]">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
          {data.legend.unit}
        </div>
      </div>
      <div className="mt-4">
        <HeatmapChart data={data} height={320} onCellSelect={handleCellSelect} />
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            {evidenceTitle}
          </p>
          {selectionLabel ? (
            <span className="text-xs text-[var(--ink-muted)]">{selectionLabel}</span>
          ) : null}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Loading evidence...</p>
        ) : null}
        {!loading && selected && evidence.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            No evidence returned for this cell.
          </p>
        ) : null}
        {!selected && !loading ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            Select a cell to inspect the underlying evidence.
          </p>
        ) : null}
        {!loading && evidence.length > 0 ? (
          <div className="mt-3 space-y-2 text-sm">
            {evidence.map((item, index) => {
              const label = pickEvidenceLabel(item, index);
              const link = evidenceLink(item);
              const detail = JSON.stringify(item);
              return link ? (
                <Link
                  key={`${label}-${index}`}
                  href={link}
                  className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                >
                  <span>{label}</span>
                  <span className="text-xs text-[var(--ink-muted)]">Open flame</span>
                </Link>
              ) : (
                <div
                  key={`${label}-${index}`}
                  className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span>{label}</span>
                    {typeof item.value === "number" ? (
                      <span className="text-xs text-[var(--ink-muted)]">
                        {formatNumber(item.value)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">{detail}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
