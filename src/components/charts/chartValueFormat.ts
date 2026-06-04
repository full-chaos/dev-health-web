import { formatNumber, formatPercent } from "@/lib/formatters";

export type ChartValueFormat = "number" | "percent" | "hours";

export function formatChartValue(value: number, format: ChartValueFormat = "number") {
  if (format === "percent") return formatPercent(value);
  if (format === "hours") return `${formatNumber(value, { maximumFractionDigits: 1 })}h`;
  return formatNumber(value);
}
