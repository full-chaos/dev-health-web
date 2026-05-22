"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";

import { SunburstChart as EChartsSunburstChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import { buildTooltipHtml, calcPercent, lightenByDepth } from "@/lib/chartUtils";

echarts.use([EChartsSunburstChart]);

export type SunburstNode = {
  name: string;
  value: number;
  children?: SunburstNode[];
  itemStyle?: {
    color?: string;
    opacity?: number;
  };
  [key: string]: unknown;
};

type SunburstChartProps = {
  data: SunburstNode;
  unit?: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  useInputColors?: boolean;
  tooltipFormatter?: (params: unknown, totalValue: number, unit: string) => string;
  onNodeClick?: (node: {
    name: string;
    value: number;
    path: string[];
    percent: number;
    data?: SunburstNode;
  }) => void;
};

/**
 * ECharts Sunburst visualization for hierarchical data.
 * Used for Investment Mix and Code Hotspots to reveal "attention sink" zones.
 * Center shows Level 1 buckets, outer rings show deeper categories.
 */
export function SunburstChart({
  data,
  unit = "units",
  height = 400,
  width = "100%",
  className,
  style,
  useInputColors = false,
  tooltipFormatter,
  onNodeClick,
}: SunburstChartProps) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const totalValue = data.value || 0;

  // Assign colors to top-level children
  const coloredData = useMemo(() => {
    if (useInputColors || !data.children?.length) return data;

    const assignColors = (node: SunburstNode, depth: number, colorIndex: number): SunburstNode => {
      const baseColor = chartColors[colorIndex % chartColors.length];

      return {
        ...node,
        itemStyle: { color: lightenByDepth(baseColor, depth) },
        children: node.children?.map((child, idx) =>
          assignColors(child, depth + 1, depth === 0 ? idx : colorIndex),
        ),
      };
    };

    return {
      ...data,
      children: data.children.map((child, idx) => assignColors(child, 0, idx)),
    };
  }, [data, chartColors, useInputColors]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!onNodeClick || !params || typeof params !== "object") return;
      const entry = params as {
        data?: { name?: string; value?: number };
        treePathInfo?: Array<{ name: string; value: number }>;
      };
      const nodeData = entry.data as SunburstNode | undefined;
      if (!nodeData?.name) return;

      const path = entry.treePathInfo?.map((p) => p.name) ?? [nodeData.name];
      const value = nodeData.value ?? 0;
      const percent = calcPercent(value, totalValue);

      onNodeClick({ name: nodeData.name, value, path, percent, data: nodeData });
    },
    [onNodeClick, totalValue],
  );

  const option = useMemo(
    () => ({
      tooltip: {
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: {
          color: chartTheme.text,
        },
        formatter: (params: unknown) => {
          if (tooltipFormatter) {
            return tooltipFormatter(params, totalValue, unit);
          }
          if (!params || typeof params !== "object") return "";
          const entry = params as {
            data?: { name?: string; value?: number };
            treePathInfo?: Array<{ name: string }>;
          };
          const nodeData = entry.data;
          if (!nodeData?.name) return "";

          const path = entry.treePathInfo?.map((p) => p.name).join(" → ") ?? nodeData.name;
          const value = nodeData.value ?? 0;
          const percent = calcPercent(value, totalValue);

          return buildTooltipHtml({
            title: nodeData.name,
            subtitle: path !== nodeData.name ? path : undefined,
            value,
            unit,
            percent,
            mutedColor: chartTheme.muted,
            accentColor: chartTheme.accent2,
          });
        },
      },
      series: [
        {
          type: "sunburst" as const,
          data: coloredData.children ?? [],
          radius: ["15%", "90%"],
          center: ["50%", "50%"],
          sort: "desc" as const,
          emphasis: {
            focus: "ancestor" as const,
          },
          label: {
            show: true,
            rotate: "tangential" as const,
            formatter: (params: unknown) => {
              const p = params as { name?: string; value?: number };
              const value = typeof p.value === "number" ? p.value : 0;
              const pct = calcPercent(value, totalValue);
              if (pct < 2) return ""; // Hide tiny labels
              return p.name ?? "";
            },
            color: chartTheme.text,
            fontSize: 10,
            minAngle: 10,
          },
          itemStyle: {
            borderColor: chartTheme.background,
            borderWidth: 2,
          },
          levels: [
            {},
            {
              r0: "15%",
              r: "40%",
              label: {
                fontSize: 12,
                fontWeight: 600,
                rotate: 0,
              },
              itemStyle: {
                borderWidth: 3,
              },
            },
            {
              r0: "40%",
              r: "65%",
              label: {
                fontSize: 10,
              },
              itemStyle: {
                borderWidth: 2,
              },
            },
            {
              r0: "65%",
              r: "90%",
              label: {
                fontSize: 9,
                position: "outside" as const,
              },
              itemStyle: {
                borderWidth: 1,
              },
            },
          ],
        },
      ],
    }),
    [coloredData, totalValue, unit, chartTheme, tooltipFormatter],
  );

  return (
    <Chart
      option={option}
      className={className}
      style={mergedStyle}
      onEvents={{ click: handleClick }}
      chartTheme={chartTheme}
      chartColors={chartColors}
    />
  );
}
