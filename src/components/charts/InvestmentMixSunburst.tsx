"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
import { formatNumber } from "@/lib/formatters";
import { titleCase, formatSubcategoryLabel } from "@/lib/investmentMix";

const adjustHex = (hex: string, amount: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const clamp = (channel: number) => Math.max(0, Math.min(255, channel));
  const r = clamp((value >> 16) + amount);
  const g = clamp(((value >> 8) & 0xff) + amount);
  const b = clamp((value & 0xff) + amount);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

type InvestmentMixSunburstProps = {
  themeDistribution: Record<string, number>;
  subcategoryDistribution: Record<string, number>;
  evidenceQualityDistribution?: Record<string, number>;
  unit?: string;
  focusedTheme?: string | null;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  onThemeClick?: (themeKey: string) => void;
  onSubcategoryClick?: (subcategoryKey: string) => void;
};

export function InvestmentMixSunburst({
  themeDistribution,
  subcategoryDistribution,
  evidenceQualityDistribution,
  unit = "units",
  focusedTheme = null,
  height = 360,
  width = "100%",
  className,
  style,
  onThemeClick,
  onSubcategoryClick,
}: InvestmentMixSunburstProps) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const sortedThemes = useMemo(
    () =>
      Object.entries(themeDistribution)
        .map(([key, value]) => ({ key, value: typeof value === "number" ? value : 0 }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value),
    [themeDistribution]
  );

  const totalValue = useMemo(
    () => sortedThemes.reduce((sum, entry) => sum + entry.value, 0),
    [sortedThemes]
  );

  const legendValueByName = useMemo(() => {
    const map = new Map<string, number>();
    sortedThemes.forEach((theme) => {
      map.set(titleCase(theme.key), theme.value);
    });
    return map;
  }, [sortedThemes]);

  const themeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    sortedThemes.forEach((theme, index) => {
      map.set(theme.key, chartColors[index % chartColors.length]);
    });
    return map;
  }, [sortedThemes, chartColors]);

  const data = useMemo(() => {
    const subEntries = Object.entries(subcategoryDistribution)
      .map(([key, value]) => ({ key, value: typeof value === "number" ? value : 0 }))
      .filter((entry) => entry.value > 0 && entry.key.includes("."));

    return sortedThemes.map((theme) => {
      const themeLabel = titleCase(theme.key);
      const baseColor = themeColorMap.get(theme.key) ?? chartTheme.grid;
      const themeOpacity = evidenceQualityDistribution?.[theme.key];
      const themeChildren =
        focusedTheme && focusedTheme !== theme.key
          ? undefined
          : subEntries
            .filter((entry) => entry.key.startsWith(`${theme.key}.`))
            .sort((a, b) => b.value - a.value)
            .map((entry, idx) => {
              const childOpacity = evidenceQualityDistribution?.[entry.key];
              return {
                name: formatSubcategoryLabel(entry.key, true),
                value: entry.value,
                itemStyle: {
                  color: adjustHex(baseColor, 18 + (idx % 3) * 10),
                  opacity: typeof childOpacity === "number" ? childOpacity : undefined,
                },
                nodeType: "subcategory",
                themeKey: theme.key,
                subcategoryKey: entry.key,
              };
            });

      return {
        name: themeLabel,
        value: theme.value,
        itemStyle: {
          color: baseColor,
          opacity: typeof themeOpacity === "number" ? themeOpacity : undefined,
        },
        nodeType: "theme",
        themeKey: theme.key,
        children: themeChildren?.length ? themeChildren : undefined,
      };
    });
  }, [
    chartTheme.grid,
    evidenceQualityDistribution,
    focusedTheme,
    sortedThemes,
    subcategoryDistribution,
    themeColorMap,
  ]);

  const handleClick = useCallback(
    (params: unknown) => {
      if (!params || typeof params !== "object") return;
      const entry = params as { data?: Record<string, unknown> };
      const node = entry.data ?? {};
      const nodeType = typeof node.nodeType === "string" ? node.nodeType : "";
      const themeKey = typeof node.themeKey === "string" ? node.themeKey : "";
      const subcategoryKey =
        typeof node.subcategoryKey === "string" ? node.subcategoryKey : "";

      if (nodeType === "theme" && themeKey && onThemeClick) {
        onThemeClick(themeKey);
      }
      if (nodeType === "subcategory" && subcategoryKey && onSubcategoryClick) {
        onSubcategoryClick(subcategoryKey);
      }
    },
    [onSubcategoryClick, onThemeClick]
  );

  const option = useMemo(
    () => ({
      tooltip: {
        confine: true,
        formatter: (params: unknown) => {
          if (!params || typeof params !== "object") return "";
          const entry = params as { data?: Record<string, unknown> };
          const node = entry.data ?? {};
          const nodeType = typeof node.nodeType === "string" ? node.nodeType : "";
          const themeKey = typeof node.themeKey === "string" ? node.themeKey : "";
          const subcategoryKey =
            typeof node.subcategoryKey === "string" ? node.subcategoryKey : "";
          const value = typeof node.value === "number" ? node.value : 0;
          const percent = calcPercent(value, totalValue);

          const title =
            nodeType === "subcategory" && subcategoryKey
              ? `${titleCase(themeKey)} · ${formatSubcategoryLabel(subcategoryKey, true)}`
              : typeof node.name === "string"
                ? node.name
                : "";

          return buildTooltipHtml({
            title,
            value,
            unit,
            percent,
            mutedColor: chartTheme.muted,
            accentColor: chartTheme.accent2,
          });
        },
      },
      legend: {
        show: true,
        data: data.map((item) => item.name),
        type: "scroll",
        bottom: 5,
        left: "center",
        width: "92%",
        itemWidth: 10,
        itemHeight: 7,
        itemGap: 12,
        pageIconSize: 10,
        formatter: (name: string) => {
          const value = legendValueByName.get(name) ?? 0;
          const pct = totalValue ? (value / totalValue) * 100 : 0;
          return `{theme|${name}}\n{value|${formatNumber(value)} ${unit}}\n{pct|${pct.toFixed(1)}% of total}`;
        },
        textStyle: {
          rich: {
            theme: { color: chartTheme.text, fontWeight: 700, fontSize: 11, lineHeight: 16 },
            value: { color: chartTheme.muted, fontSize: 10, lineHeight: 14 },
            pct: { color: chartTheme.accent2, fontSize: 10, lineHeight: 14 },
          },
        },
      },
      series: [
        {
          type: "sunburst" as const,
          data,
          radius: ["18%", "70%"],
          center: ["50%", "50%"],
          sort: "desc" as const,
          nodeClick: false as const,
          emphasis: { focus: "ancestor" as const },
          label: {
            show: true,
            rotate: 0,
            formatter: (params: unknown) => {
              const p = params as { value?: number; name?: string };
              const value = typeof p.value === "number" ? p.value : 0;
              const pct = calcPercent(value, totalValue);
              if (pct < 3) return "";
              return p.name ?? "";
            },
            color: chartTheme.text,
            fontSize: 11,
            minAngle: 10,
          },
          itemStyle: {
            borderColor: chartTheme.background,
            borderWidth: 2,
          },
          levels: [
            {},
            {
              r0: "18%",
              r: "44%",
              label: {
                fontSize: 12,
                fontWeight: 700,
              },
              itemStyle: { borderWidth: 3 },
            },
            {
              r0: "44%",
              r: "70%",
              label: { show: false },
              emphasis: {
                label: { show: true, color: chartTheme.text, fontSize: 11 },
              },
              itemStyle: { borderWidth: 2 },
            },
          ],
        },
      ],
    }),
    [chartTheme, data, legendValueByName, totalValue, unit]
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
