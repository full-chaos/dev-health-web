"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";

import { useChartColors, useChartTheme } from "./chartTheme";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type ChartProps = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  onEvents?: Record<string, (params: unknown) => void>;
};

export function Chart({ option, className, style, onEvents }: ChartProps) {
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<{ resize?: () => void } | null>(null);
  const chartColors = useChartColors();
  const chartTheme = useChartTheme();

  const baseOption: EChartsOption = {
    color: chartColors,
    textStyle: {
      color: chartTheme.text,
      fontFamily: "var(--font-body, system-ui, sans-serif)",
    },
    animationDuration: 600,
  };

  const mergedOption = {
    ...baseOption,
    ...option,
    textStyle: { ...baseOption.textStyle, ...option.textStyle },
  } as EChartsOption;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        chartInstanceRef.current?.resize?.();
      });
    });
    observer.observe(containerRef.current);
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      data-chart-ready={isReady ? "true" : "false"}
    >
      <ReactECharts
        option={mergedOption}
        style={{ width: "100%", height: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
        onChartReady={(instance) => {
          setIsReady(true);
          chartInstanceRef.current = instance;
          chartInstanceRef.current?.resize?.();
        }}
      />
    </div>
  );
}
