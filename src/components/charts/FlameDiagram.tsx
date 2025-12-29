"use client";

import type { CSSProperties } from "react";
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
} from "echarts";

import type { FlameFrame } from "@/lib/types";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";

const formatDuration = (start: string, end: string) => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return "--";
  }
  const ms = Math.max(0, endTime - startTime);
  const minutes = ms / 60000;
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = minutes / 60;
  if (hours < 36) {
    return `${hours.toFixed(1)}h`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
};

const frameDepths = (frames: FlameFrame[]) => {
  const map = new Map(frames.map((frame) => [frame.id, frame]));
  const depths = new Map<string, number>();

  const resolveDepth = (frame: FlameFrame, stack: Set<string>): number => {
    if (depths.has(frame.id)) {
      return depths.get(frame.id) ?? 0;
    }
    if (!frame.parent_id || !map.has(frame.parent_id)) {
      depths.set(frame.id, 0);
      return 0;
    }
    if (stack.has(frame.id)) {
      depths.set(frame.id, 0);
      return 0;
    }
    stack.add(frame.id);
    const parent = map.get(frame.parent_id);
    const parentDepth = parent ? resolveDepth(parent, stack) : 0;
    const depth = parentDepth + 1;
    depths.set(frame.id, depth);
    stack.delete(frame.id);
    return depth;
  };

  frames.forEach((frame) => resolveDepth(frame, new Set()));
  return depths;
};

type FlameDiagramProps = {
  frames: FlameFrame[];
  start: string;
  end: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function FlameDiagram({
  frames,
  start,
  end,
  height = 320,
  width = "100%",
  className,
  style,
}: FlameDiagramProps) {
  const chartTheme = useChartTheme();
  const colors = useChartColors();

  const depthMap = frameDepths(frames);
  const maxDepth = Math.max(0, ...Array.from(depthMap.values()));

  const data = frames.map((frame) => {
    const depth = depthMap.get(frame.id) ?? 0;
    return [frame.start, frame.end, depth, frame.label, frame.state, frame.category];
  });

  const colorForFrame = (state: string, category: string) => {
    if (category === "rework") {
      return colors[8] ?? "#f97316";
    }
    if (state === "waiting") {
      return colors[6] ?? "#f59e0b";
    }
    if (state === "blocked") {
      return colors[9] ?? "#ef4444";
    }
    if (state === "ci") {
      return colors[3] ?? "#0ea5e9";
    }
    return colors[0] ?? "#1d4ed8";
  };

  const mergedStyle: CSSProperties = { height, width, ...style };

  return (
    <Chart
      option={{
        tooltip: {
          confine: true,
          formatter: (params: { value?: Array<string | number> }) => {
            if (!params?.value) {
              return "";
            }
            const label = params.value[3];
            const state = params.value[4];
            const category = params.value[5];
            const duration = formatDuration(String(params.value[0]), String(params.value[1]));
            return [
              `<strong>${label}</strong>`,
              `State: ${state}`,
              `Category: ${category}`,
              `Duration: ${duration}`,
            ].join("<br/>");
          },
        },
        grid: { left: 24, right: 24, top: 16, bottom: 40, containLabel: true },
        xAxis: {
          type: "time",
          min: start,
          max: end,
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
          splitLine: { lineStyle: { color: chartTheme.grid } },
        },
        yAxis: {
          type: "value",
          min: -0.5,
          max: maxDepth + 0.5,
          inverse: false,
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
        dataZoom: [
          { type: "inside", filterMode: "weakFilter" },
          { type: "slider", height: 18, bottom: 8 },
        ],
        series: [
          {
            type: "custom",
            renderItem: (
              params: CustomSeriesRenderItemParams,
              api: CustomSeriesRenderItemAPI
            ) => {
              const startValue = api.value(0);
              const endValue = api.value(1);
              const depth = api.value(2);
              const label = api.value(3);
              const state = api.value(4);
              const category = api.value(5);

              const startCoord = api.coord([startValue, depth]);
              const endCoord = api.coord([endValue, depth]);
              const height = api.size([0, 1])[1] * 0.7;
              const y = startCoord[1] - height / 2;
              const width = endCoord[0] - startCoord[0];

              return {
                type: "rect",
                shape: { x: startCoord[0], y, width, height },
                style: {
                  fill: colorForFrame(state, category),
                  stroke: chartTheme.grid,
                  lineWidth: 1,
                },
                textContent: {
                  style: {
                    text: label,
                    fill: chartTheme.text,
                    fontSize: 11,
                    overflow: "truncate",
                  },
                },
                textConfig: {
                  position: "insideLeft",
                  offset: [6, 0],
                },
              };
            },
            data,
            encode: { x: [0, 1], y: 2 },
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
