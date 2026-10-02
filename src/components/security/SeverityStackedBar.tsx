"use client";

import { useMemo } from "react";

import { Chart } from "@/components/charts/Chart";
import { type ChartTokens, useChartTheme, useChartTokens } from "@/components/charts/chartTheme";
import { SkeletonLine } from "@/components/ui/Skeleton";
import type { SeverityBucketData } from "./types";

const SEVERITY_ORDER: SeverityBucketData["severity"][] = [
    "critical",
    "high",
    "medium",
    "low",
    "unknown",
];

const severityColors = (
    tokens: ChartTokens,
    mutedColor: string,
): Record<SeverityBucketData["severity"], string> => ({
    critical: tokens.negative,
    high: tokens.accentHighlight,
    medium: tokens.caution,
    low: tokens.info,
    unknown: mutedColor,
});

type SeverityStackedBarProps = {
    buckets: SeverityBucketData[];
    loading?: boolean;
};

export function SeverityStackedBar({ buckets, loading }: SeverityStackedBarProps) {
    const chartTheme = useChartTheme();
    const tokens = useChartTokens();

    const option = useMemo(() => {
        const colorBySeverity = severityColors(tokens, chartTheme.muted);
        const byKey = new Map(buckets.map((b) => [b.severity, b.count]));
        const ordered = SEVERITY_ORDER.map((sev) => ({
            severity: sev,
            count: byKey.get(sev) ?? 0,
            color: colorBySeverity[sev],
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
    }, [buckets, chartTheme, tokens]);

    if (loading) {
        return <SkeletonLine height="h-48" />;
    }

    return <Chart option={option} style={{ height: 240, width: "100%" }} chartTheme={chartTheme} />;
}
