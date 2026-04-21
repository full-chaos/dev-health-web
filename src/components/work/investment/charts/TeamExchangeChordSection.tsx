"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChordChart } from "@/components/charts/ChordChart";
import {
  ChordChartControls,
  parseChordControlsFromSearchParams,
  serializeChordControlsToSearchParams,
  type ChordControlsValue,
} from "@/components/charts/ChordChartControls";
import { ChordSummaryPanel } from "@/components/charts/ChordSummaryPanel";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { buildChordDataset } from "@/lib/chord";
import type { MetricFilter } from "@/lib/filters/types";
import { useChordFlow } from "@/lib/graphql/hooks/useChordFlow";

type TeamExchangeChordSectionProps = {
  /**
   * Optional explicit org ID override. When omitted, `useChordFlow` reads
   * from the session via `useOrgId()` (matches `useInvestmentFlow` /
   * `useSecurity` convention). Pass a value only for tests or embeds
   * outside the auth provider.
   */
  orgId?: string;
  filters: MetricFilter;
  dateRange: { startDate: string; endDate: string };
  effortUnit: string;
  className?: string;
};

export function TeamExchangeChordSection({
  orgId,
  filters,
  dateRange,
  effortUnit,
  className,
}: TeamExchangeChordSectionProps) {
  const searchParams = useSearchParams();
  const [controls, setControls] = useState<ChordControlsValue>(() =>
    parseChordControlsFromSearchParams(searchParams)
  );
  const [highlightedEntity, setHighlightedEntity] = useState<string | null>(null);

  const { data: records, fetching, error } = useChordFlow({
    orgId,
    grouping: controls.grouping,
    dateRange,
    pause: !orgId,
  });

  const entityCount = useMemo(() => {
    return new Set((records ?? []).flatMap((record) => [record.source, record.target])).size;
  }, [records]);

  const otherAvailable = useMemo(() => {
    return entityCount > controls.topN;
  }, [controls.topN, entityCount]);

  const dataset = useMemo(() => {
    if (!records) {
      return null;
    }

    return buildChordDataset(records, {
      topN: controls.showOther ? controls.topN : Math.max(controls.topN, entityCount || controls.topN),
      includeSelfLinks: controls.showSelfLinks,
      direction: controls.direction,
      grouping: controls.grouping,
      unit: effortUnit,
    });
  }, [controls.direction, controls.grouping, controls.showOther, controls.showSelfLinks, controls.topN, effortUnit, entityCount, records]);

  const nodeIdByLabel = useMemo(() => {
    const map = new Map<string, string>();
    dataset?.nodes.forEach((node) => {
      map.set(node.label, node.id);
    });
    return map;
  }, [dataset]);

  const highlightedLabel = useMemo(
    () => dataset?.nodes.find((node) => node.id === highlightedEntity)?.label ?? null,
    [dataset, highlightedEntity]
  );

  const handleControlsChange = useCallback(
    (next: ChordControlsValue) => {
      setControls(next);
      if (typeof window === "undefined") {
        return;
      }

      const nextParams = serializeChordControlsToSearchParams(next, new URLSearchParams(searchParams.toString()));
      const nextQuery = nextParams.toString();
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
      window.history.replaceState(window.history.state, "", nextUrl);
    },
    [searchParams]
  );

  const handleChartClick = useCallback(
    (item: { type: "node" | "link"; name?: string; source?: string; target?: string }) => {
      const nextEntity = item.type === "node"
        ? nodeIdByLabel.get(item.name ?? "") ?? item.name ?? null
        : nodeIdByLabel.get(item.source ?? "") ?? nodeIdByLabel.get(item.target ?? "") ?? item.source ?? item.target ?? null;
      setHighlightedEntity(nextEntity);
    },
    [nodeIdByLabel]
  );

  const handleRowSelect = useCallback((entityId: string) => {
    setHighlightedEntity(entityId);
  }, []);

  return (
    <section
      className={`rounded-3xl border border-(--card-stroke) bg-card p-5 ${className ?? ""}`}
      data-scope-level={filters.scope.level}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-(--font-display) text-lg">Team exchange chord</h3>
            {highlightedLabel ? (
              <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                Highlighted: {highlightedLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-(--ink-muted)">
            Exchange of {controls.grouping === "work_type" ? "work types" : `${controls.grouping}s`} across repositories. Shows pairs that frequently touch the same work.
          </p>
        </div>
        <ChordChartControls value={controls} onChange={handleControlsChange} otherAvailable={otherAvailable} className="max-w-full" />
      </header>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {fetching ? (
          <>
            <SkeletonChart height="h-[420px]" />
            <ChordSummaryPanel dataset={null} unit={effortUnit} loading />
          </>
        ) : error ? (
          <div className="lg:col-span-2">
            <ErrorCard
              title="Unable to load exchange view"
              message="We couldn’t load exchange pairs for this window. Try again after adjusting the date range or scope."
            />
          </div>
        ) : (
          <>
            <div
              data-testid="team-exchange-chord-chart"
              data-highlighted-entity={highlightedEntity ?? ""}
              data-highlighted-label={highlightedLabel ?? ""}
            >
              <ChordChart dataset={dataset ?? buildChordDataset([], { grouping: controls.grouping, unit: effortUnit })} unit={effortUnit} onItemClick={handleChartClick} />
            </div>
            <ChordSummaryPanel dataset={dataset} unit={effortUnit} onEntitySelect={handleRowSelect} />
          </>
        )}
      </div>
    </section>
  );
}
