"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSankey } from "@/lib/api";
import type { MetricFilter } from "@/lib/filters/types";
import type { QuadrantPoint, SankeyMode } from "@/lib/types";
import {
  SANKEY_MODES,
  buildSankeyDataset,
  buildSankeyEvidenceUrl,
  getSankeyDefinition,
  type SankeyDataset,
} from "@/lib/sankey";

import { SankeyChart } from "./SankeyChart";

type SankeyInvestigationPanelProps = {
  filters: MetricFilter;
  point: QuadrantPoint;
};

const windowLabel = (start?: string, end?: string) => {
  if (start && end) {
    return start === end ? start : `${start} - ${end}`;
  }
  return start || end || "Selected window";
};

export function SankeyInvestigationPanel({
  filters,
  point,
}: SankeyInvestigationPanelProps) {
  const router = useRouter();
  const useSampleData =
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
  const [mode, setMode] = useState<SankeyMode>("investment");
  const [dataset, setDataset] = useState<SankeyDataset | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  const requestPayload = useMemo(
    () => ({
      mode,
      filters,
      context: {
        entity_id: point.entity_id,
        entity_label: point.entity_label,
      },
      window_start: point.window_start,
      window_end: point.window_end,
    }),
    [
      filters,
      mode,
      point.entity_id,
      point.entity_label,
      point.window_end,
      point.window_start,
    ],
  );
  const requestKey = useMemo(
    () => JSON.stringify(requestPayload),
    [requestPayload],
  );

  const definition = useMemo(() => getSankeyDefinition(mode), [mode]);
  const sampleDataset = useMemo(
    () => (useSampleData ? buildSankeyDataset(mode) : null),
    [mode, useSampleData],
  );
  const selectionLabel = point.entity_label ? point.entity_label : "Selected dot";
  const scopeSummary = useMemo(() => {
    const level = filters.scope.level;
    if (filters.scope.ids.length) {
      return `${level}: ${filters.scope.ids.join(", ")}`;
    }
    return `${level}: all`;
  }, [filters.scope.ids, filters.scope.level]);

  useEffect(() => {
    let active = true;
    if (useSampleData) {
      return () => {
        active = false;
      };
    }
    getSankey(requestPayload)
      .then((response) => {
        if (!active) {
          return;
        }
        if (!response?.nodes?.length || !response.links?.length) {
          setDataset(null);
          return;
        }
        setDataset({
          mode,
          label: response.label ?? definition.label,
          description: response.description ?? definition.description,
          unit: response.unit ?? definition.unit,
          nodes: response.nodes,
          links: response.links,
        });
      })
      .catch(() => {
        if (active) {
          setDataset(null);
        }
      })
      .finally(() => {
        if (active) {
          setResolvedKey(requestKey);
        }
      });
    return () => {
      active = false;
    };
  }, [
    definition.description,
    definition.label,
    definition.unit,
    mode,
    requestKey,
    requestPayload,
    useSampleData,
  ]);

  const handleModeChange = (nextMode: SankeyMode) => {
    if (nextMode === mode) {
      return;
    }
    setMode(nextMode);
  };

  const handleItemClick = (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
  }) => {
    const label = item.name ?? item.target ?? item.source ?? null;
    const linkLabel =
      item.source && item.target ? `${item.source} -> ${item.target}` : null;
    const href = buildSankeyEvidenceUrl({
      mode,
      filters,
      label,
      linkLabel,
      window_start: point.window_start,
      window_end: point.window_end,
    });
    router.push(href);
  };

  const resolvedDataset = useSampleData
    ? sampleDataset
    : resolvedKey === requestKey
      ? dataset
      : null;
  const panelLabel = resolvedDataset?.label ?? definition.label;
  const panelDescription =
    resolvedDataset?.description ?? definition.description;
  const isLoading = useSampleData ? false : resolvedKey !== requestKey;
  const normalizedDataset =
    resolvedDataset && resolvedDataset.nodes.length && resolvedDataset.links.length
      ? resolvedDataset
      : null;
  const hasDataset = Boolean(normalizedDataset);

  return (
    <div
      className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-4 text-xs text-[var(--ink-muted)]"
      data-testid="sankey-investigation-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Sankey investigation
          </p>
          <p className="mt-2 text-sm text-[var(--foreground)]">
            {panelLabel}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {panelDescription}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Scope: {scopeSummary}
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--ink-muted)]">
          {selectionLabel} | {windowLabel(point.window_start, point.window_end)}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em]">
        {SANKEY_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => handleModeChange(entry.id)}
            className={`rounded-full border px-3 py-1 transition ${
              mode === entry.id
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                : "border-[var(--card-stroke)] text-[var(--ink-muted)]"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        {normalizedDataset ? (
          <SankeyChart
            nodes={normalizedDataset.nodes}
            links={normalizedDataset.links}
            unit={normalizedDataset.unit}
            height={260}
            style={{ minWidth: 560 }}
            onItemClick={handleItemClick}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card)] p-4 text-[11px] text-[var(--ink-muted)]">
            {isLoading
              ? "Loading Sankey data..."
              : "Not enough data in the current scope and time window."}
          </div>
        )}
      </div>
      {hasDataset ? (
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
          Click a node or link to open evidence lists for this scope and window.
        </p>
      ) : null}
    </div>
  );
}
