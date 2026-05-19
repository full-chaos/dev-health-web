"use client";

import { useMemo } from "react";
import { Chart } from "@/components/charts/Chart";
import { useChartTheme } from "@/components/charts/chartTheme";
import type { AiReviewLoadRow } from "@/lib/graphql/__generated__/types";

type DailyRow = AiReviewLoadRow & { day?: string };

type AIReviewAmplificationTrendProps = {
  daily: DailyRow[];
  loading?: boolean;
};

export function AIReviewAmplificationTrend({ daily, loading }: AIReviewAmplificationTrendProps) {
  const chartTheme = useChartTheme();
  const indexed = useMemo(
    () => daily.map((row, index) => ({ ...row, chartDay: row.day ?? `Point ${index + 1}` })),
    [daily]
  );
  const buckets = useMemo(() => Array.from(new Set(indexed.map((row) => row.bucket))).sort(), [indexed]);
  const days = useMemo(() => Array.from(new Set(indexed.map((row) => row.chartDay))).sort(), [indexed]);

  const option = useMemo(() => ({
    tooltip: { trigger: "axis" as const, confine: true, backgroundColor: chartTheme.background, borderColor: chartTheme.stroke, textStyle: { color: chartTheme.text } },
    legend: { data: buckets, bottom: 0, textStyle: { color: chartTheme.muted } },
    grid: { left: 44, right: 20, top: 20, bottom: 48, containLabel: true },
    xAxis: { type: "category" as const, data: days, axisLabel: { color: chartTheme.muted, fontSize: 10 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
    yAxis: { type: "value" as const, axisLabel: { color: chartTheme.muted, fontSize: 10 }, splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } } },
    series: buckets.map((bucket) => ({
      name: bucket,
      type: "line" as const,
      smooth: true,
      symbol: "circle",
      data: days.map((day) => indexed.find((row) => row.bucket === bucket && row.chartDay === day)?.reviewAmplification ?? null),
    })),
  }), [buckets, chartTheme, days, indexed]);

  return (
    <section className="rounded-3xl border border-(--card-stroke) bg-card p-5" data-testid="ai-review-amplification-trend">
      <h3 className="font-(--font-display) text-lg">Review amplification trend</h3>
      <p className="mt-1 text-sm text-(--ink-muted)">
        Daily review amplification split by AI attribution bucket.
      </p>
      <div className="mt-4 h-72">
        {loading ? <p className="text-sm text-(--ink-muted)">Loading trend…</p> : days.length > 0 ? <Chart option={option} /> : <p className="text-sm text-(--ink-muted)">No daily review amplification points appear in this range.</p>}
      </div>
    </section>
  );
}
