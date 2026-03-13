"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type ThroughputHistogramProps = {
  throughputMean: number;
  throughputStddev: number;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

function generateHistogramData(
  mean: number,
  stddev: number,
  bins: number = 10
): { labels: string[]; values: number[]; binEdges: number[] } {
  const minVal = Math.max(0, mean - 3 * stddev);
  const maxVal = mean + 3 * stddev;
  const binWidth = (maxVal - minVal) / bins;

  const labels: string[] = [];
  const values: number[] = [];
  const binEdges: number[] = [];

  for (let i = 0; i < bins; i++) {
    const binStart = minVal + i * binWidth;
    const binEnd = binStart + binWidth;
    const binMid = (binStart + binEnd) / 2;

    binEdges.push(binStart);
    labels.push(binMid.toFixed(1));

    // Normal distribution probability density
    const z = (binMid - mean) / stddev;
    const density = Math.exp(-0.5 * z * z) / (stddev * Math.sqrt(2 * Math.PI));
    // Scale to reasonable histogram heights (simulating ~30 days of data)
    values.push(Math.round(density * 30 * binWidth * 10) / 10);
  }
  binEdges.push(maxVal);

  return { labels, values, binEdges };
}

export function ThroughputHistogram({
  throughputMean,
  throughputStddev,
  height = 200,
  width = "100%",
  className,
  style,
}: ThroughputHistogramProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const { labels, values, binEdges } = useMemo(
    () => generateHistogramData(throughputMean, throughputStddev),
    [throughputMean, throughputStddev]
  );

  const meanIndex = useMemo(() => {
    for (let i = 0; i < binEdges.length - 1; i++) {
      if (throughputMean >= binEdges[i] && throughputMean < binEdges[i + 1]) {
        return i + (throughputMean - binEdges[i]) / (binEdges[i + 1] - binEdges[i]);
      }
    }
    return labels.length / 2;
  }, [throughputMean, binEdges, labels.length]);

  const stddevLow = Math.max(0, throughputMean - throughputStddev);
  const stddevHigh = throughputMean + throughputStddev;

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text, fontSize: 11 },
        formatter: (params: unknown) => {
          const arr = params as Array<{ name?: string; value?: number }>;
          const p = arr[0];
          if (!p) return "";
          return `<strong>${p.name ?? ""} items/day</strong><br/>Frequency: ${p.value ?? 0}`;
        },
      },
      grid: {
        left: 40,
        right: 20,
        top: 30,
        bottom: 40,
      },
      xAxis: {
        type: "category" as const,
        data: labels,
        name: "Items/Day",
        nameLocation: "middle" as const,
        nameGap: 25,
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: { color: chartTheme.muted, fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value" as const,
        name: "Frequency",
        nameLocation: "middle" as const,
        nameGap: 30,
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: chartTheme.muted, fontSize: 9 },
        splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } },
      },
      series: [
        {
          name: "Throughput Distribution",
          type: "bar" as const,
          data: values,
          itemStyle: {
            color: chartTheme.accent1,
            opacity: 0.7,
          },
          emphasis: {
            itemStyle: { opacity: 1 },
          },
          barWidth: "80%",
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: chartTheme.accent2, width: 2, type: "solid" as const },
            label: {
              show: true,
              position: "end" as const,
              formatter: `Mean: ${throughputMean.toFixed(1)}`,
              color: chartTheme.accent2,
              fontSize: 10,
            },
            data: [{ xAxis: meanIndex }],
          },
          markArea: {
            silent: true,
            itemStyle: {
              color: chartTheme.accent2,
              opacity: 0.1,
            },
            label: {
              show: true,
              position: ["50%", "10%"] as [string, string],
              formatter: `±1σ`,
              color: chartTheme.muted,
              fontSize: 9,
            },
            data: [
              [
                { xAxis: labels.findIndex((l) => parseFloat(l) >= stddevLow) },
                { xAxis: labels.findIndex((l) => parseFloat(l) >= stddevHigh) || labels.length - 1 },
              ],
            ] as [[{ xAxis: number }, { xAxis: number }]],
          },
        },
      ],
    }),
    [labels, values, meanIndex, throughputMean, stddevLow, stddevHigh, chartTheme]
  );

  return (
    <div className={className} style={mergedStyle} data-testid="chart-throughput-histogram">
      <Chart option={option} className="h-full w-full" chartTheme={chartTheme} />
    </div>
  );
}
