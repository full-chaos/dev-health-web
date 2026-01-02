/**
 * Shared chart formatting utilities for ECharts visualizations.
 */

/**
 * Format a number for display in tooltips and labels.
 */
export const formatTooltipValue = (value: number | undefined, unit: string): string => {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "--";
    }
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
};

/**
 * Format a percentage value.
 */
export const formatPercent = (value: number, total: number): string => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return "--";
    }
    return `${((value / total) * 100).toFixed(1)}%`;
};

/**
 * Calculate percentage of total.
 */
export const calcPercent = (value: number, total: number): number => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return 0;
    }
    return (value / total) * 100;
};

/**
 * Build a standard HTML tooltip with consistent styling.
 */
export const buildTooltipHtml = (params: {
    title: string;
    subtitle?: string;
    value: number | string;
    unit: string;
    percent?: number;
    extra?: string;
    mutedColor?: string;
    accentColor?: string;
}): string => {
    const { title, subtitle, value, unit, percent, extra, mutedColor = "#6b7280", accentColor = "#8b5cf6" } = params;
    const formattedValue = typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value;
    const percentLine = typeof percent === "number" && Number.isFinite(percent)
        ? `<span style="color: ${accentColor}; margin-left: 8px;">(${percent.toFixed(1)}%)</span>`
        : "";

    return `
    <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
    ${subtitle ? `<div style="font-size: 11px; color: ${mutedColor}; margin-bottom: 4px;">${subtitle}</div>` : ""}
    <div style="font-family: var(--font-mono, monospace);">
      <strong>${formattedValue}</strong> ${unit}
      ${percentLine}
    </div>
    ${extra ? `<div style="margin-top: 4px; font-size: 11px; color: ${mutedColor};">${extra}</div>` : ""}
  `;
};

/**
 * Build path string from hierarchy data.
 */
export const buildPathString = (path: string[]): string => {
    return path.join(" → ");
};

/**
 * Common gradient colors for stacked area charts.
 */
export const GRADIENT_COLORS = {
    planned: { start: "rgba(59, 130, 246, 0.8)", end: "rgba(59, 130, 246, 0.1)" },
    unplanned: { start: "rgba(168, 85, 247, 0.8)", end: "rgba(168, 85, 247, 0.1)" },
    rework: { start: "rgba(249, 115, 22, 0.8)", end: "rgba(249, 115, 22, 0.1)" },
    abandonment: { start: "rgba(239, 68, 68, 0.8)", end: "rgba(239, 68, 68, 0.1)" },
};

/**
 * Create a vertical gradient for area charts.
 */
export const createAreaGradient = (color: { start: string; end: string }) => ({
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
        { offset: 0, color: color.start },
        { offset: 1, color: color.end },
    ],
});
