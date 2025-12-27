"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { EChartsOption } from "echarts";

import { chartColors, chartTextColor } from "./chartTheme";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type ChartProps = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  onEvents?: Record<string, (params: unknown) => void>;
};

const baseOption: EChartsOption = {
  color: chartColors,
  textStyle: {
    color: chartTextColor,
    fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
  },
  animationDuration: 600,
};

export function Chart({ option, className, style, onEvents }: ChartProps) {
  const [isReady, setIsReady] = useState(false);
  const mergedOption = {
    ...baseOption,
    ...option,
  } as EChartsOption;

  return (
    <div
      className={className}
      style={style}
      data-chart-ready={isReady ? "true" : "false"}
    >
      <ReactECharts
        option={mergedOption}
        style={{ width: "100%", height: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
        onChartReady={() => setIsReady(true)}
      />
    </div>
  );
}
