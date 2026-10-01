"use client";

import { investmentThemeColor, useChartTokens } from "@/components/charts/chartTheme";
import { formatNumber } from "@/lib/formatters";
import type { ReworkThemeAllocation } from "@/lib/types";

type ReworkThemeBarsProps = {
    rows: ReworkThemeAllocation[];
};

/** Production color of every bar before the theme colors: kept for an unknown theme key. */
const UNKNOWN_THEME_COLOR = "var(--accent-2)";

/**
 * Rework by Theme rows: label, allocation %, one bar, "N PRs", "X k churn LOC".
 * Rows are drawn in the order given and take no data fetch: the server page
 * passes them. A bar has the fixed color of its investment theme.
 */
export function ReworkThemeBars({ rows }: ReworkThemeBarsProps) {
    const tokens = useChartTokens();

    return (
        <ul className="mt-4 space-y-4" data-testid="rework-theme-bars">
            {rows.map((row) => (
                <li key={row.theme} data-theme={row.theme}>
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-xs text-(--ink-muted)">
                            {formatNumber(row.allocation_pct, { maximumFractionDigits: 1 })}%
                        </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-(--card-stroke)">
                        <div
                            data-testid="rework-theme-bar"
                            className="h-full rounded-full"
                            style={{
                                width: `${Math.min(100, row.allocation_pct)}%`,
                                backgroundColor: investmentThemeColor(
                                    row.theme,
                                    tokens,
                                    UNKNOWN_THEME_COLOR,
                                ),
                            }}
                        />
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-(--ink-muted)">
                        <span>
                            {row.prs_merged.toLocaleString()} PR
                            {row.prs_merged !== 1 ? "s" : ""}
                        </span>
                        <span>
                            {formatNumber(row.churn_loc / 1000, { maximumFractionDigits: 1 })}k
                            churn LOC
                        </span>
                    </div>
                </li>
            ))}
        </ul>
    );
}
