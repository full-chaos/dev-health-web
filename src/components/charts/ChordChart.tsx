"use client";

import { type CSSProperties, useCallback, useMemo } from "react";

import { ChordChart as EChartsChordChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import type { ChordDataset } from "@/lib/types";

echarts.use([EChartsChordChart]);

const formatValue = (value: number | undefined, unit: string) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(0)} ${unit}`;
};

const formatPercent = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return "--";
  }
  return `${((value / total) * 100).toFixed(1)}%`;
};

type ChordChartProps = {
  dataset: ChordDataset;
  unit?: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  tooltipFormatter?: (params: unknown, unit: string) => string;
  onItemClick?: (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
    value?: number;
  }) => void;
};

export function ChordChart({
  dataset,
  unit = "items",
  height = 420,
  width = "100%",
  className,
  style,
  tooltipFormatter,
  onItemClick,
}: ChordChartProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = useMemo(
    () => ({ height, width, ...style }),
    [height, width, style],
  );

  const { chartData, chartEdges, outgoingTotals, totalFlow } = useMemo(() => {
    const outgoingTotals = new Map<string, number>();
    const incomingTotals = new Map<string, number>();
    const chartEdges: { source: string; target: string; value: number }[] = [];

    const n = dataset.nodes.length;
    for (let i = 0; i < n; i++) {
      let rowSum = 0;
      for (let j = 0; j < n; j++) {
        const val = dataset.matrix[i][j];
        if (val > 0) {
          chartEdges.push({
            source: dataset.nodes[i].label,
            target: dataset.nodes[j].label,
            value: val,
          });
          rowSum += val;
          incomingTotals.set(
            dataset.nodes[j].label,
            (incomingTotals.get(dataset.nodes[j].label) ?? 0) + val,
          );
        }
      }
      outgoingTotals.set(dataset.nodes[i].label, rowSum);
    }

    const chartData = dataset.nodes.map((node) => {
      const rowSum = outgoingTotals.get(node.label) ?? 0;
      const colSum = incomingTotals.get(node.label) ?? 0;
      return {
        name: node.label,
        value: rowSum + colSum,
        itemStyle: node.isOther ? { color: chartTheme.muted ?? "#94a3b8" } : undefined,
      };
    });

    return { chartData, chartEdges, outgoingTotals, totalFlow: dataset.totalFlow };
  }, [dataset, chartTheme.muted]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onItemClick || !params || typeof params !== "object") {
        return;
      }
      const entry = params as {
        dataType?: string;
        data?: {
          name?: string;
          value?: number;
          source?: string;
          target?: string;
        };
        name?: string;
      };
      const data = entry.data ?? {};
      const isLink = entry.dataType === "edge";
      onItemClick({
        type: isLink ? "link" : "node",
        name: data.name ?? entry.name ?? "",
        source: data.source,
        target: data.target,
        value: data.value,
      });
    },
    [onItemClick],
  );

  const option = useMemo(() => {
    const defaultTooltipFormatter = (params: unknown) => {
      if (!params || typeof params !== "object") {
        return "";
      }
      const entry = params as {
        dataType?: string;
        data?: {
          name?: string;
          value?: number;
          source?: string;
          target?: string;
        };
        name?: string;
      };
      const data = entry.data ?? {};

      if (entry.dataType === "edge") {
        const sourceLabel = data.source ?? "";
        const targetLabel = data.target ?? "";
        const totalFromSource = data.source ? (outgoingTotals.get(data.source) ?? 0) : 0;
        const unitLabel = unit === "hours" ? "Elapsed" : "Value";
        const shareLine =
          totalFromSource > 0 && typeof data.value === "number"
            ? `<br/><span style="color: ${chartTheme.accent2}">${formatPercent(data.value, totalFromSource)}</span> of source outflow`
            : "";

        return `
          <div style="font-weight: 600; margin-bottom: 4px;">Flow</div>
          <div style="font-size: 11px; color: ${chartTheme.muted}">${sourceLabel} &rarr; ${targetLabel}</div>
          <div style="margin-top: 4px;">
            <span style="color: ${chartTheme.muted}">${unitLabel}:</span> 
            <span style="font-weight: 600; font-family: monospace;">${formatValue(data.value, unit)}</span>
            ${shareLine}
          </div>
        `;
      }

      const nodeName = data.name ?? entry.name ?? "";
      const nodeValue = typeof data.value === "number" ? data.value : 0;
      const unitLabel = unit === "hours" ? "Total Elapsed" : "Total Value";
      const shareLine =
        totalFlow > 0
          ? `<br/><span style="color: ${chartTheme.accent2}">${formatPercent(nodeValue, totalFlow)}</span> of total`
          : "";

      return `
        <div style="font-weight: 600; margin-bottom: 4px;">${nodeName}</div>
        <div>
          <span style="color: ${chartTheme.muted}">${unitLabel}:</span> 
          <span style="font-weight: 600; font-family: monospace;">${formatValue(nodeValue, unit)}</span>
          ${shareLine}
        </div>
      `;
    };

    return {
      aria: {
        enabled: true,
        label: {
          description: `Chord chart of ${dataset.grouping} exchange. Total flow ${dataset.totalFlow} ${unit}. ${dataset.nodes.length} entities shown.`,
        },
      },
      tooltip: {
        trigger: "item" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
        formatter: (params: unknown) =>
          tooltipFormatter ? tooltipFormatter(params, unit) : defaultTooltipFormatter(params),
      },
      series: [
        {
          type: "chord" as const,
          radius: ["60%", "75%"],
          center: ["50%", "50%"],
          padAngle: 2,
          emphasis: { focus: "adjacency" as const },
          data: chartData,
          edges: chartEdges,
          label: { show: true, position: "outside" as const, color: chartTheme.text, fontSize: 11 },
          itemStyle: { borderColor: chartTheme.grid, borderWidth: 1 },
          lineStyle: {
            color: "source",
            opacity: 0.55,
            curveness: 0.5,
          },
        },
      ],
    };
  }, [
    chartData,
    chartEdges,
    unit,
    chartTheme,
    tooltipFormatter,
    outgoingTotals,
    totalFlow,
    dataset.grouping,
    dataset.totalFlow,
    dataset.nodes.length,
  ]);

  const onEvents = useMemo(
    () => (onItemClick ? { click: handleClick } : undefined),
    [onItemClick, handleClick],
  );

  if (dataset.nodes.length === 0 || dataset.totalFlow === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className || ""}`}
        style={mergedStyle}
        data-chord-empty="true"
      >
        No flows match the current filters. Try expanding the date range or switching grouping
        dimension.
      </div>
    );
  }
  if (dataset.nodes.length === 1) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className || ""}`}
        style={mergedStyle}
        data-chord-single="true"
      >
        Only one entity found — chord charts show pairwise exchange. Try a different grouping.
      </div>
    );
  }

  return (
    <Chart
      option={option}
      className={className}
      style={mergedStyle}
      onEvents={onEvents}
      chartTheme={chartTheme}
    />
  );
}
