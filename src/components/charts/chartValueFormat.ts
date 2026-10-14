import { formatNumber, formatPercent } from "@/lib/formatters";

export type ChartValueFormat = "number" | "percent" | "hours";

export function formatChartValue(value: number, format: ChartValueFormat = "number") {
    if (format === "percent") return formatPercent(value);
    if (format === "hours") return `${formatNumber(value, { maximumFractionDigits: 1 })}h`;
    return formatNumber(value);
}

const AXIS_SPLIT_COUNT = 5;

/** Fraction digits a value axis needs so neighbouring ticks never print the same label. */
export function axisTickDigits(values: Array<number | null | undefined>): number {
    const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!finite.length) return 1;
    const span = Math.max(0, ...finite) - Math.min(0, ...finite);
    if (span === 0) return 1;
    const step = span / AXIS_SPLIT_COUNT;
    return Math.min(6, Math.max(1, Math.floor(-Math.log10(step)) + 2));
}

/** A tick label for a number axis: `digits` decimals at most, and a value that rounds to zero prints "0". */
export function formatAxisTick(value: number, digits: number): string {
    const text = formatNumber(value, { maximumFractionDigits: digits });
    return /^-0(\.0*)?$/.test(text) ? "0" : text;
}
