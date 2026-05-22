"use client";

import { useMemo } from "react";

import { Chart } from "@/components/charts/Chart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { SeverityBucketData } from "./types";

const SEVERITY_ORDER: SeverityBucketData["severity"][] = [
  "critical",
  "high",
  "medium",
  "low",
  "unknown",
];

const SEVERITY_COLORS: Record<SeverityBucketData["severity"], string> = {
  critical: "#dc2626", // red-600
  high: "#f97316", // orange-500
  medium: "#fbbf24", // amber-400
  low: "#94a3b8", // slate-400
  unknown: "#cbd5e1", // slate-300
};

type SeverityStackedBarProps = {
  buckets: SeverityBucketData[];
  loading?: boolean;
};

export function SeverityStackedBar({ buckets, loading }: SeverityStackedBarProps) {
  const chartTheme = useChartTheme();

  const option = useMemo(() => {
    const byKey = new Map(buckets.map((b) => [b.severity, b.count]));
    const ordered = SEVERITY_ORDER.map((sev) => ({
      severity: sev,
      count: byKey.get(sev) ?? 0,
      color: SEVERITY_COLORS[sev],
    }));

    return {
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
      },
      grid: { left: 80, right: 24, top: 20, bottom: 20 },
      xAxis: {
        type: "value" as const,
        splitLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: { color: chartTheme.muted },
      },
      yAxis: {
        type: "category" as const,
        data: ordered.map((b) => b.severity),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: { color: chartTheme.muted },
      },
      series: [
        {
          type: "bar" as const,
          barMaxWidth: 18,
          label: {
            show: true,
            position: "right" as const,
            color: chartTheme.muted,
          },
          data: ordered.map((b) => ({
            value: b.count,
            itemStyle: { color: b.color },
          })),
        },
      ],
    };
  }, [buckets, chartTheme]);

  if (loading) {
    return <SkeletonLine height="h-48" />;
  }

  return <Chart option={option} style={{ height: 240, width: "100%" }} chartTheme={chartTheme} />;
}
