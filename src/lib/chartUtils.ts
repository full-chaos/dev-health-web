/**
 * Shared chart formatting utilities for ECharts visualizations.
 */

/**
 * Reason a metric has no displayable numeric value.
 *
 * A bare "--" cannot tell a reader whether data is missing, could not be
 * computed, or is genuinely zero. These reasons make dash-only states
 * self-explanatory. Zero is a real value and is NEVER treated as absent.
 */
export type ValueAbsence = "absent" | "unavailable";

/** Customer-safe short labels that disambiguate a bare "--". */
export const VALUE_ABSENCE_LABEL: Record<ValueAbsence, string> = {
	absent: "No data",
	unavailable: "Unavailable",
};

/**
 * Classify why a numeric value cannot be shown, or `null` when it can.
 *
 * - `absent`: the value was never provided (null/undefined) — no data.
 * - `unavailable`: a number was expected but is not finite (NaN/Infinity).
 * - `null`: the value is finite (including 0) and should be formatted.
 */
export const classifyValueAbsence = (
	value: number | null | undefined,
): ValueAbsence | null => {
	if (value === null || value === undefined) return "absent";
	if (typeof value !== "number" || !Number.isFinite(value))
		return "unavailable";
	return null;
};

/**
 * Format a number for display in tooltips and labels.
 *
 * Absent (null/undefined) and unavailable (NaN/Infinity) values render as
 * distinct, human-readable labels instead of an ambiguous "--". A genuine zero
 * formats normally (e.g. "0 hours") so it is never confused with missing data.
 */
export const formatTooltipValue = (
	value: number | null | undefined,
	unit: string,
): string => {
	const absence = classifyValueAbsence(value);
	if (absence) {
		return VALUE_ABSENCE_LABEL[absence];
	}
	return `${(value as number).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
};

/**
 * Format a percentage value.
 *
 * Non-finite inputs render as "Unavailable" (a number was expected but could
 * not be computed); a non-positive denominator renders as "No data" (there is
 * nothing to take a share of). Both are clearer than a bare "--".
 */
export const formatPercent = (value: number, total: number): string => {
	if (!Number.isFinite(value) || !Number.isFinite(total)) {
		return VALUE_ABSENCE_LABEL.unavailable;
	}
	if (total <= 0) {
		return VALUE_ABSENCE_LABEL.absent;
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
 * Lightens a hex color based on tree depth for hierarchical charts.
 * At depth 0, returns the base color unchanged.
 */
export const lightenByDepth = (
	color: string,
	depth: number,
	factor = 15,
): string => {
	if (depth <= 0) return color;

	const normalized = color.replace("#", "");
	if (normalized.length !== 6) return color;

	const value = Number.parseInt(normalized, 16);
	if (Number.isNaN(value)) return color;

	const clamp = (channel: number) => Math.max(0, Math.min(255, channel));
	const amount = depth * factor;
	const r = clamp((value >> 16) + amount);
	const g = clamp(((value >> 8) & 0xff) + amount);
	const b = clamp((value & 0xff) + amount);

	return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
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
	const {
		title,
		subtitle,
		value,
		unit,
		percent,
		extra,
		mutedColor = "#6b7280",
		accentColor = "#8b5cf6",
	} = params;
	const formattedValue =
		typeof value === "number"
			? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
			: value;
	const percentLine =
		typeof percent === "number" && Number.isFinite(percent)
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
	unplanned: {
		start: "rgba(168, 85, 247, 0.8)",
		end: "rgba(168, 85, 247, 0.1)",
	},
	rework: { start: "rgba(249, 115, 22, 0.8)", end: "rgba(249, 115, 22, 0.1)" },
	abandonment: {
		start: "rgba(239, 68, 68, 0.8)",
		end: "rgba(239, 68, 68, 0.1)",
	},
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
