"use client";

import { useState } from "react";

import { EvidencePanel } from "@/components/evidence";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";

type MetricEvidenceCardsProps = {
  metrics: string[];
  deltas: MetricDelta[];
  filters: MetricFilter;
  activeRole?: string;
  placeholderDeltas: boolean;
};

const deltaTone = (value?: number) => {
  if (value === undefined || value === null) return "text-(--ink-muted)";
  return value > 0
    ? "text-(--accent-3)"
    : value < 0
      ? "text-(--accent-negative)"
      : "text-(--ink-muted)";
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric);

export function MetricEvidenceCards({
  metrics,
  deltas,
  filters,
  activeRole,
  placeholderDeltas,
}: MetricEvidenceCardsProps) {
  const [activeMetric, setActiveMetric] = useState<MetricDelta | null>(null);

  return (
    <>
      <EvidencePanel
        isOpen={Boolean(activeMetric)}
        onCloseAction={() => setActiveMetric(null)}
        title={activeMetric?.label ?? "Metric evidence"}
        metric={activeMetric?.metric}
        filters={filters}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((metric) => {
          const data = getMetric(deltas, metric);
          const label = data?.label ?? metric;
          const sparkValues = data?.spark?.map((point) => point.value) ?? [];
          const sparkLabels = data?.spark?.map((point) => point.ts) ?? [];

          return (
            <article
              key={metric}
              className="group rounded-3xl border border-(--card-stroke) bg-card p-4 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                <span>{label}</span>
                <span className={deltaTone(data?.delta_pct)}>
                  {placeholderDeltas || data?.delta_pct === undefined ? "--" : formatDelta(data.delta_pct)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-2xl font-semibold metric-hero">
                    {placeholderDeltas || data?.value === undefined
                      ? "--"
                      : formatMetricValue(data.value, data.unit ?? "")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveMetric(data ?? { metric, label, value: 0, unit: "", delta_pct: 0, spark: [] })}
                    className="mt-2 text-left text-xs text-(--accent-2) underline-offset-4 hover:underline"
                  >
                    See evidence
                  </button>
                </div>
                <div className="h-16 w-full">
                  {sparkValues.length > 1 ? (
                    <SparklineChart data={sparkValues} categories={sparkLabels} height={64} />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                      Trend
                    </div>
                  )}
                </div>
              </div>
              <a
                href={buildExploreUrl({ metric, filters, role: activeRole })}
                className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-(--ink-muted) hover:text-foreground"
              >
                Open in Explore
              </a>
            </article>
          );
        })}
      </section>
    </>
  );
}
