"use client";

import { investmentSeriesColor, useChartColors } from "@/components/charts/chartTheme";
import { formatMetricValue, formatNumber } from "@/lib/formatters";
import type { ReworkThemeAllocation } from "@/lib/types";

type ReworkThemeBarsProps = {
    rows: ReworkThemeAllocation[];
};

/** A theme key the map does not know gets the neutral muted token, never the action color. */
const UNKNOWN_THEME_COLOR = "var(--text-muted)";

/**
 * Rework by Theme rows: label, allocation %, one bar, "N PRs", "X k churn LOC".
 * Rows are drawn in the order given and take no data fetch: the server page
 * passes them. A bar has the fixed color of its investment theme.
 */
export function ReworkThemeBars({ rows }: ReworkThemeBarsProps) {
    const chartColors = useChartColors();

    return (
        <ul className="mt-4 space-y-4" data-testid="rework-theme-bars">
            {rows.map((row) => {
                const width = Math.min(100, row.allocation_pct);
                return (
                    <li key={row.theme} data-theme={row.theme}>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{row.label}</span>
                            <span className="text-xs text-(--ink-muted)">
                                {formatNumber(row.allocation_pct, { maximumFractionDigits: 1 })}%
                            </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-r-(--radius-sm) bg-background">
                            {width > 0 ? (
                                <div
                                    aria-hidden="true"
                                    data-testid="rework-theme-bar"
                                    className="h-full rounded-r-(--radius-sm)"
                                    style={{
                                        width: `${width}%`,
                                        minWidth: 2,
                                        backgroundColor: investmentSeriesColor(
                                            row.theme,
                                            chartColors,
                                            UNKNOWN_THEME_COLOR,
                                        ),
                                    }}
                                />
                            ) : null}
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-(--ink-muted)">
                            <span>
                                {row.prs_merged.toLocaleString()} PR
                                {row.prs_merged !== 1 ? "s" : ""}
                            </span>
                            <span>
                                {/* The shared metric format: compact, and a served non-zero value
                                    is never shown as 0 (it was "0k" under 50 lines). */}
                                {formatMetricValue(row.churn_loc, "loc")} churn LOC
                            </span>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
