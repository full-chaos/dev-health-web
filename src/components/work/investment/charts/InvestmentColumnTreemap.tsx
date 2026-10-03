"use client";

import type { CSSProperties, ReactNode } from "react";

import type { TreemapNode } from "@/components/charts/TreemapChart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { tileLabel } from "@/lib/chartLabelColor";
import { formatNumber } from "@/lib/formatters";

/** What a click reports: the same shape the ECharts treemap gave its `onNodeClickAction`. */
export type ColumnTreemapClick = { name: string; path: string[]; data?: TreemapNode };

/** Extra fields the Investment mix puts on its nodes (see `InvestmentMixSection`). */
type MixNode = TreemapNode & {
    nodeType?: "theme" | "subcategory";
    themeKey?: string;
    categoryId?: string;
};

type InvestmentColumnTreemapProps = {
    /** Root node: one child per theme, each with its subcategories. Values are used as given. */
    data: TreemapNode;
    /** Height of the cell area in px (the column heads sit above it). */
    height?: number;
    /** `theme:<key>` or `subcategory:<id>` of the selected node, as the section keys it. */
    selectedKey?: string | null;
    onNodeClickAction?: (node: ColumnTreemapClick) => void;
    /** Text for a node's tooltip and accessible name (value, unit, share, quality). */
    describeNodeAction?: (node: TreemapNode, path: string[]) => string;
    ariaLabel: string;
};

/** A cell label is hidden under this share of the total (production's treemap rule). */
const MIN_LABEL_SHARE_PCT = 2;

const positive = (nodes: TreemapNode[] | undefined): TreemapNode[] =>
    (nodes ?? []).filter((node) => Number.isFinite(node.value) && node.value > 0);

const byValueDesc = (nodes: TreemapNode[]): TreemapNode[] =>
    nodes
        .map((node, index) => ({ node, index }))
        .sort((a, b) => b.node.value - a.node.value || a.index - b.index)
        .map(({ node }) => node);

export const columnTreemapKey = (node: TreemapNode): string => {
    const mix = node as MixNode;
    return mix.nodeType === "subcategory"
        ? `subcategory:${mix.categoryId ?? node.name}`
        : `theme:${mix.themeKey ?? node.name}`;
};

/**
 * The Investment mix as theme columns (approved prototype `treemapChart`): one row of columns,
 * one column per theme, column width by the theme's share of the total; the theme's subcategories
 * fill the column, each cell's AREA by its value. A head above each column names the theme and
 * its share; a legend row repeats the themes under the chart.
 *
 * Layout only. Every value, color and opacity comes from `data` (the section builds it from the
 * persisted mix; opacity is evidence quality). The geometry is CSS: column widths are `fr` units
 * of the theme values and the cells are nested flex boxes that split by value, first across the
 * height and then across the width, so areas stay proportional at any width with no measuring.
 */
export function InvestmentColumnTreemap({
    data,
    height = 292,
    selectedKey = null,
    onNodeClickAction,
    describeNodeAction,
    ariaLabel,
}: InvestmentColumnTreemapProps) {
    const chartTheme = useChartTheme();
    const themes = byValueDesc(positive(data.children));
    const total = themes.reduce((sum, theme) => sum + theme.value, 0);
    if (themes.length === 0 || total <= 0) return null;

    const shareOf = (value: number) => (value / total) * 100;
    const headShare = (value: number) =>
        `${formatNumber(shareOf(value), { maximumFractionDigits: 1 })}%`;
    const cellShare = (value: number) =>
        `${formatNumber(shareOf(value), { maximumFractionDigits: 0 })}%`;

    const select = (node: TreemapNode, path: string[]) =>
        onNodeClickAction?.({ name: node.name, path, data: node });

    const cell = (node: TreemapNode, path: string[], inherited: { color?: string }): ReactNode => {
        const color = node.itemStyle?.color ?? inherited.color ?? chartTheme.grid;
        const opacity = node.itemStyle?.opacity;
        const ink = tileLabel(color, opacity, chartTheme.background);
        const inkStyle: CSSProperties = {
            color: ink.color,
        };
        const key = columnTreemapKey(node);
        const description = describeNodeAction?.(node, path) ?? path.join(" · ");
        const showLabel = shareOf(node.value) >= MIN_LABEL_SHARE_PCT;
        return (
            <button
                key={key}
                type="button"
                data-testid="column-treemap-cell"
                data-node-key={key}
                data-share={shareOf(node.value).toFixed(4)}
                aria-pressed={selectedKey === key}
                aria-label={description}
                title={description}
                onClick={() => select(node, path)}
                style={{ flex: `${node.value} 1 0%` }}
                className="@container relative min-h-0 min-w-0 overflow-hidden rounded-sm text-left transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) aria-pressed:ring-2 aria-pressed:ring-(--accent)"
            >
                <span
                    aria-hidden="true"
                    data-testid="column-treemap-fill"
                    className="absolute inset-0"
                    style={{ backgroundColor: color, opacity }}
                />
                {showLabel ? (
                    // Top-left, as drawn. Hidden when the cell is too narrow to hold it (the
                    // tooltip and the accessible name still carry the text).
                    <span
                        aria-hidden="true"
                        data-testid="column-treemap-label"
                        className="absolute inset-x-0 top-0 hidden px-1.75 pt-1.5 text-xs leading-tight @min-[3.5rem]:block"
                        style={inkStyle}
                    >
                        <span className="block truncate font-semibold">{node.name}</span>
                        <span className="block truncate tabular-nums">{cellShare(node.value)}</span>
                    </span>
                ) : null}
            </button>
        );
    };

    // Slice-and-dice: the largest item takes its share of this box; the rest share what is left,
    // split the other way. Each item's area is its value's share of the column.
    const split = (
        items: TreemapNode[],
        path: string[],
        inherited: { color?: string },
        vertical: boolean,
    ): ReactNode => {
        if (items.length === 1) return cell(items[0], [...path, items[0].name], inherited);
        const [first, ...rest] = items;
        const restValue = rest.reduce((sum, item) => sum + item.value, 0);
        return (
            <>
                {cell(first, [...path, first.name], inherited)}
                <div
                    className={`flex min-h-0 min-w-0 gap-0.5 ${vertical ? "flex-row" : "flex-col"}`}
                    style={{ flex: `${restValue} 1 0%` }}
                >
                    {split(rest, path, inherited, !vertical)}
                </div>
            </>
        );
    };

    return (
        <div data-testid="column-treemap">
            <div
                role="group"
                aria-label={ariaLabel}
                data-testid="column-treemap-columns"
                className="grid gap-1.5"
                style={{
                    gridTemplateColumns: themes
                        .map((theme) => `minmax(0, ${theme.value}fr)`)
                        .join(" "),
                }}
            >
                {themes.map((theme) => {
                    const key = columnTreemapKey(theme);
                    const children = byValueDesc(positive(theme.children));
                    const inherited = { color: theme.itemStyle?.color };
                    const description = describeNodeAction?.(theme, [theme.name]) ?? theme.name;
                    return (
                        <div
                            key={key}
                            data-testid="column-treemap-column"
                            data-node-key={key}
                            data-share={shareOf(theme.value).toFixed(4)}
                            className="flex min-w-0 flex-col"
                        >
                            <button
                                type="button"
                                data-testid="column-treemap-head"
                                aria-pressed={selectedKey === key}
                                aria-label={description}
                                title={description}
                                onClick={() => select(theme, [theme.name])}
                                className="mb-1.5 block min-w-0 rounded-sm px-0.5 text-left text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) aria-pressed:text-(--accent-text)"
                            >
                                <span className="block truncate font-medium text-foreground">
                                    {theme.name}
                                </span>
                                <span className="block truncate tabular-nums text-(--ink-muted)">
                                    {headShare(theme.value)}
                                </span>
                            </button>
                            <div
                                data-testid="column-treemap-cells"
                                className="flex min-h-0 min-w-0 flex-col gap-0.5"
                                style={{ height }}
                            >
                                {children.length > 0
                                    ? split(children, [theme.name], inherited, true)
                                    : // A theme with no subcategory is one cell: the theme itself.
                                      cell(theme, [theme.name], inherited)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <ul
                data-testid="column-treemap-legend"
                aria-label="Themes"
                className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-(--ink-muted)"
            >
                {themes.map((theme) => (
                    <li key={columnTreemapKey(theme)} className="inline-flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className="block h-2.5 w-2.5 shrink-0 rounded-xs"
                            style={{ backgroundColor: theme.itemStyle?.color ?? chartTheme.grid }}
                        />
                        {theme.name}
                        <b className="font-semibold tabular-nums text-foreground">
                            {headShare(theme.value)}
                        </b>
                    </li>
                ))}
            </ul>
        </div>
    );
}
