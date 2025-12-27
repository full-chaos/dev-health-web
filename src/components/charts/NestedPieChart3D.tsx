"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartColors, useChartTheme } from "./chartTheme";

const adjustHex = (hex: string, amount: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }
  const value = Number.parseInt(normalized, 16);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel));
  const r = clamp((value >> 16) + amount);
  const g = clamp(((value >> 8) & 0xff) + amount);
  const b = clamp((value & 0xff) + amount);
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

type NestedPieChart3DProps = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes: Array<{ name: string; value: number; parentKey: string }>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function NestedPieChart3D({
  categories,
  subtypes,
  height = 380,
  width = "100%",
  className,
  style,
}: NestedPieChart3DProps) {
  const chartTheme = useChartTheme();
  const categoryColors = chartColors.slice(0, categories.length);
  const categoryColorMap = new Map(
    categories.map((category, index) => [category.key, categoryColors[index]])
  );

  const innerData = categories.map((category, index) => ({
    name: category.name,
    value: category.value,
    itemStyle: {
      color: categoryColors[index],
      borderRadius: 4,
      shadowBlur: 18,
      shadowOffsetY: 8,
      shadowColor: "rgba(0, 0, 0, 0.2)",
    },
  }));

  const outerData = subtypes.map((subtype, subtypeIndex) => {
    const baseColor = categoryColorMap.get(subtype.parentKey) ?? chartColors[0];
    return {
      name: subtype.name,
      value: subtype.value,
      itemStyle: {
        color: adjustHex(baseColor, 18 + (subtypeIndex % 3) * 10),
        borderRadius: 4,
        shadowBlur: 18,
        shadowOffsetY: 8,
        shadowColor: "rgba(0, 0, 0, 0.2)",
      },
    };
  });

  const innerShadowData = categories.map((category, index) => ({
    name: category.name,
    value: category.value,
    itemStyle: {
      color: adjustHex(categoryColors[index], -40),
      borderRadius: 4,
    },
  }));

  const outerShadowData = subtypes.map((subtype, subtypeIndex) => {
    const baseColor = categoryColorMap.get(subtype.parentKey) ?? chartColors[0];
    return {
      name: subtype.name,
      value: subtype.value,
      itemStyle: {
        color: adjustHex(baseColor, -30 + (subtypeIndex % 3) * -4),
        borderRadius: 4,
      },
    };
  });

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "item", confine: true },
        legend: {
          data: categories.map((category) => category.name),
          type: "scroll",
          bottom: 0,
          left: "center",
          width: "88%",
          itemWidth: 12,
          itemHeight: 8,
          itemGap: 16,
          pageIconSize: 10,
          textStyle: { color: chartTheme.muted },
        },
        series: [
          {
            name: "Subtype Depth",
            type: "pie",
            radius: ["58%", "78%"],
            center: ["50%", "44%"],
            padAngle: 2,
            silent: true,
            label: { show: false },
            tooltip: { show: false },
            emphasis: { disabled: true },
            data: outerShadowData,
          },
          {
            name: "Category Depth",
            type: "pie",
            radius: ["32%", "52%"],
            center: ["50%", "44%"],
            padAngle: 2,
            silent: true,
            label: { show: false },
            tooltip: { show: false },
            emphasis: { disabled: true },
            data: innerShadowData,
          },
          {
            name: "Subtype",
            type: "pie",
            radius: ["58%", "78%"],
            center: ["50%", "40%"],
            padAngle: 2,
            label: {
              color: chartTheme.muted,
              fontSize: 11,
              formatter: "{b}",
            },
            labelLine: { length: 12, length2: 10 },
            data: outerData,
          },
          {
            name: "Category",
            type: "pie",
            radius: ["32%", "52%"],
            center: ["50%", "40%"],
            padAngle: 2,
            label: {
              color: chartTheme.muted,
              fontWeight: 600,
              formatter: "{b}\n{d}%",
            },
            labelLine: { length: 8, length2: 6 },
            data: innerData,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
