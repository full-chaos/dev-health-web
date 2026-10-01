"use client";

import { formatNumber } from "@/lib/formatters";
import { scaleMidpoint, type HeatmapScale } from "@/lib/heatmapRamp";

import { useChartTheme, useChartTokens } from "./chartTheme";

type HeatmapScaleLegendProps = {
    /** Smallest value on the scale, in `unit`. */
    min: number;
    /** Largest value on the scale, in `unit`. */
    max: number;
    unit: string;
    scale?: HeatmapScale;
    className?: string;
};

const format = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

/**
 * Scale legend for a one-hue heatmap: the ramp from min to max with the unit,
 * and a separate swatch for cells with no data (missing is not zero).
 */
export function HeatmapScaleLegend({
    min,
    max,
    unit,
    scale = "linear",
    className,
}: HeatmapScaleLegendProps) {
    const { seq } = useChartTokens();
    const chartTheme = useChartTheme();
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    const label = hasRange
        ? `Scale from ${format(min)} to ${format(max)} ${unit}`
        : `Value ${Number.isFinite(max) ? format(max) : "unknown"} ${unit}`;

    return (
        <div
            data-testid="heatmap-scale-legend"
            className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-(--ink-muted) ${className ?? ""}`}
        >
            <div className="min-w-48 max-w-sm flex-1">
                <div
                    role="img"
                    aria-label={label}
                    className="h-2 w-full rounded-sm"
                    style={{ background: `linear-gradient(to right, ${seq.join(", ")})` }}
                />
                <div className="mt-1 flex justify-between tabular-nums">
                    <span data-testid="heatmap-scale-min">
                        {Number.isFinite(min) ? format(min) : "–"}
                    </span>
                    {hasRange ? (
                        <span data-testid="heatmap-scale-mid">
                            {format(scaleMidpoint(min, max, scale))}
                        </span>
                    ) : null}
                    <span data-testid="heatmap-scale-max">
                        {Number.isFinite(max) ? format(max) : "–"} {unit}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2" data-testid="heatmap-scale-empty">
                <span
                    aria-hidden="true"
                    className="inline-block h-3 w-4 rounded-sm"
                    style={{
                        background: chartTheme.background,
                        border: `1px dashed ${chartTheme.muted}`,
                    }}
                />
                <span>No data</span>
            </div>
        </div>
    );
}
