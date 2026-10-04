"use client";

import { useMemo } from "react";
import { Chart } from "@/components/charts/Chart";
import { Section } from "@/components/ui/Section";
import { useChartTheme } from "@/components/charts/chartTheme";
import { buildTooltip, lineMark, withPointSymbols } from "@/components/charts/chartConventions";

import type { AiReviewLoadRow } from "@/lib/graphql/__generated__/types";
import { bucketLabel, formatReviewTrendDay } from "./utils";

type DailyRow = AiReviewLoadRow & { day?: string };

type AIReviewAmplificationTrendProps = {
    daily: DailyRow[];
    loading?: boolean;
};

export function reviewAmplificationTrendRows(daily: DailyRow[]) {
    const datedRows = daily.filter((row): row is DailyRow & { day: string } => Boolean(row.day));
    const days = Array.from(new Set(datedRows.map((row) => row.day))).sort((left, right) =>
        left.localeCompare(right),
    );

    return {
        rows: datedRows,
        days,
        labels: days.map(formatReviewTrendDay),
    };
}

export function AIReviewAmplificationTrend({ daily, loading }: AIReviewAmplificationTrendProps) {
    const chartTheme = useChartTheme();
    const trend = useMemo(() => reviewAmplificationTrendRows(daily), [daily]);
    const buckets = useMemo(
        () => Array.from(new Set(trend.rows.map((row) => row.bucket))).sort(),
        [trend.rows],
    );

    const option = useMemo(
        () => ({
            tooltip: buildTooltip(chartTheme, { crosshair: true }),
            legend: {
                data: buckets.map(bucketLabel),
                bottom: 0,
                textStyle: { color: chartTheme.muted },
            },
            grid: { left: 44, right: 20, top: 20, bottom: 48, containLabel: true },
            xAxis: {
                type: "category" as const,
                data: trend.labels,
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
                axisLine: { lineStyle: { color: chartTheme.grid } },
            },
            yAxis: {
                type: "value" as const,
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
                splitLine: { lineStyle: { color: chartTheme.grid } },
            },
            series: buckets.map((bucket) => {
                const data = trend.days.map(
                    (day) =>
                        trend.rows.find((row) => row.bucket === bucket && row.day === day)
                            ?.reviewAmplification ?? null,
                );
                return {
                    name: bucketLabel(bucket),
                    type: "line" as const,
                    smooth: true,
                    symbol: "circle",
                    // A dot only on the last and isolated points; days with no data are gaps.
                    showAllSymbol: true,
                    symbolSize: 4,
                    lineStyle: lineMark,
                    data: withPointSymbols(data, chartTheme),
                };
            }),
        }),
        [buckets, chartTheme, trend],
    );

    return (
        <Section
            as="h3"
            title="Review amplification trend"
            description="Daily review amplification split by AI attribution bucket."
            data-testid="ai-review-amplification-trend"
        >
            <div className="h-72">
                {loading ? (
                    <p className="text-sm text-(--ink-muted)">Loading trend…</p>
                ) : trend.days.length > 0 ? (
                    <Chart option={option} />
                ) : (
                    <p className="text-sm text-(--ink-muted)">
                        No daily review amplification points appear in this range.
                    </p>
                )}
            </div>
        </Section>
    );
}
