"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";

import type { AggregatedFlameNode } from "@/lib/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import { blendOver, depthOpacity, tileLabel } from "@/lib/chartLabelColor";
import { useChartTheme, useChartTokens } from "./chartTheme";

const formatValue = (value: number, unit: string) => {
    if (unit === "hours") {
        if (value < 1) {
            return `${Math.round(value * 60)}m`;
        }
        if (value < 24) {
            return `${formatNumber(value, { maximumFractionDigits: 1 })}h`;
        }
        return `${formatNumber(value / 24, { maximumFractionDigits: 1 })}d`;
    }
    if (unit === "loc") {
        if (value >= 1000) {
            return `${formatNumber(value / 1000, { maximumFractionDigits: 1 })}k`;
        }
        return formatNumber(Math.round(value));
    }
    return formatNumber(Math.round(value));
};

/**
 * A served amount with its unit, once. Hours already carry their unit in the value
 * ("45m", "3.2h", "7,480.8d"), so the unit name is not added again; other units are
 * named after the value ("12.3k loc", "18 items").
 */
export const formatAmount = (value: number, unit: string) =>
    unit === "hours" ? formatValue(value, unit) : `${formatValue(value, unit)} ${unit}`;

const formatShare = (value: number, total: number) => {
    if (total === 0) return "0%";
    return `${formatNumber((value / total) * 100, { maximumFractionDigits: 1 })}%`;
};

/** Prototype `flameChart`: 44px rows, 2px between blocks and rows, 10px label inset. */
export const FLAME_ROW_HEIGHT = 44;
export const FLAME_GAP = 2;
const LABEL_PAD = 10;
/** Space between the name and the percent in a label. */
const LABEL_SPACE = 8;
/** Approximate advance of one character at the 12px label size (bold name, regular percent). */
const NAME_CHAR_PX = 7;
const SHARE_CHAR_PX = 6.4;
/** Layout width before the first measurement (and where nothing can be measured). */
const FALLBACK_WIDTH = 1000;

export type FlameLabel = "name-share" | "name" | "none";

/**
 * What a block of `blockPx` width can show, as in the prototype: the bold name and the
 * percent when both fit, else the name alone when it fits, else nothing (the full name
 * stays in the tooltip). Layout only; the percent is the block's share of the served total.
 */
export const flameLabel = (name: string, share: string, blockPx: number): FlameLabel => {
    const room = blockPx - FLAME_GAP - LABEL_PAD * 2;
    const nameWidth = name.length * NAME_CHAR_PX;
    if (nameWidth + LABEL_SPACE + share.length * SHARE_CHAR_PX <= room) return "name-share";
    if (nameWidth <= room) return "name";
    return "none";
};

function BlockText({ kind, name, share }: { kind: FlameLabel; name: string; share: string }) {
    if (kind === "none") return null;
    return (
        <>
            <span className="truncate font-bold">{name}</span>
            {kind === "name-share" ? (
                <span data-testid="flame-share" className="ml-2 shrink-0 opacity-80">
                    {share}
                </span>
            ) : null}
        </>
    );
}

type StackFrame = {
    node: AggregatedFlameNode;
    label: string;
};

type HierarchicalFlameGraphProps = {
    root: AggregatedFlameNode;
    unit: string;
    /** Width in px; measured from the container when left out or not a number. */
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    /**
     * How rows are colored. "branch": each top-level branch takes the series token at its
     * position in the data (use only where the top level has at most 5 branches by contract).
     * "single": one hue for every row. Depth is shown by opacity steps in both. Default "single".
     */
    colorBy?: "branch" | "single";
    /** Control drawn left of the search (the page's mode switch), as in the prototype. */
    toolbar?: ReactNode;
};

/** Most branches that get their own series token (the series palette is not cycled). */
export const MAX_CATEGORICAL_BRANCHES = 5;

/**
 * Icicle flame chart, drawn as the prototype `flameChart`: a title row with the shown root,
 * a root row at 100% of the shown total, then one 44px row per level below it, each block
 * as wide as its served value. Click a block to zoom into it; the title row is the way back.
 * Widths and percents are shares of served values (layout math); nothing else is computed.
 */
export function HierarchicalFlameGraph({
    root,
    unit,
    width = "100%",
    className,
    style,
    colorBy = "single",
    toolbar,
}: HierarchicalFlameGraphProps) {
    const chartTheme = useChartTheme();
    const tokens = useChartTokens();
    const [zoomStack, setZoomStack] = useState<StackFrame[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [hoveredNode, setHoveredNode] = useState<AggregatedFlameNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const fixedWidth = typeof width === "number" ? width : undefined;
    const chartRef = useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = useState(0);
    useEffect(() => {
        if (fixedWidth !== undefined || !chartRef.current) return;
        const element = chartRef.current;
        const update = () => setMeasured(element.clientWidth);
        update();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [fixedWidth]);
    const layoutWidth = fixedWidth ?? (measured || FALLBACK_WIDTH);

    const currentRoot = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1].node : root;
    const totalValue = root.value;

    const filteredChildren = useMemo(() => {
        if (!searchQuery.trim()) {
            return currentRoot.children ?? [];
        }
        const query = searchQuery.toLowerCase();
        const matchesQuery = (node: AggregatedFlameNode): boolean => {
            if (node.name.toLowerCase().includes(query)) return true;
            return (node.children ?? []).some(matchesQuery);
        };
        return (currentRoot.children ?? []).filter(matchesQuery);
    }, [currentRoot, searchQuery]);

    // After zooming, rows keep the color of the top-level branch they came from.
    const zoomedBranchIndex =
        zoomStack.length > 0
            ? (root.children ?? []).findIndex((child) => child === zoomStack[0].node)
            : undefined;

    const branchColor = useCallback(
        (branchIndex: number) =>
            colorBy === "branch" && branchIndex >= 0 && branchIndex < MAX_CATEGORICAL_BRANCHES
                ? (tokens.flameBranch[branchIndex] ?? tokens.themeOperational)
                : tokens.themeOperational,
        [colorBy, tokens.flameBranch, tokens.themeOperational],
    );

    const handleZoomIn = useCallback((node: AggregatedFlameNode) => {
        if (!node.children?.length) return;
        setZoomStack((prev) => [...prev, { node, label: node.name }]);
    }, []);

    const handleZoomOut = useCallback((index: number) => {
        setZoomStack((prev) => prev.slice(0, index));
    }, []);

    const handleReset = useCallback(() => {
        setZoomStack([]);
        setSearchQuery("");
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setTooltipPos({ x: e.clientX, y: e.clientY });
    }, []);

    const renderNode = (
        node: AggregatedFlameNode,
        depth: number,
        index: number,
        parentValue: number,
        branchIndex: number = index,
    ): React.ReactNode => {
        const widthPercent = parentValue > 0 ? (node.value / parentValue) * 100 : 0;
        if (widthPercent < 0.5) return null;

        const hasChildren = (node.children?.length ?? 0) > 0;
        // Color follows the top-level branch (or one hue); depth is an opacity step.
        // Depth counts from the real root, so a zoomed row keeps the shade it had before zooming.
        const fill = blendOver(
            branchColor(branchIndex),
            depthOpacity(depth + zoomStack.length),
            chartTheme.background,
        );
        const ink = tileLabel(fill, undefined, chartTheme.background);
        const isSearchMatch =
            searchQuery.trim() && node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const share = formatShare(node.value, totalValue);
        const blockPx = currentRoot.value > 0 ? (node.value / currentRoot.value) * layoutWidth : 0;
        const label = flameLabel(node.name, share, blockPx);

        return (
            <div
                key={`${depth}-${index}-${node.name}`}
                className="relative min-w-0"
                style={{ width: `${widthPercent}%` }}
            >
                <button
                    type="button"
                    data-testid="flame-block"
                    onClick={() => handleZoomIn(node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onMouseMove={handleMouseMove}
                    disabled={!hasChildren}
                    className={`flex items-center overflow-hidden whitespace-nowrap rounded-xs text-left text-xs transition-all duration-150 ${
                        hasChildren ? "cursor-pointer hover:brightness-110" : "cursor-default"
                    }`}
                    style={{
                        // The block is 2px narrower than its share: the gap to the next block.
                        width: `calc(100% - ${FLAME_GAP}px)`,
                        // Only a labelled block has the label inset: a thin block stays inside its share.
                        paddingInline: label === "none" ? 0 : LABEL_PAD,
                        height: FLAME_ROW_HEIGHT,
                        marginBottom: FLAME_GAP,
                        backgroundColor: fill,
                        color: ink.color,
                        textShadow: "none",
                        boxShadow: isSearchMatch ? `0 0 0 2px ${tokens.accentHighlight}` : "none",
                    }}
                    title={node.name}
                >
                    <BlockText kind={label} name={node.name} share={share} />
                </button>
                {hasChildren && (
                    <div className="flex">
                        {(node.children ?? []).map((child, childIndex) =>
                            renderNode(child, depth + 1, childIndex, node.value, branchIndex),
                        )}
                    </div>
                )}
            </div>
        );
    };

    const breadcrumbs = [
        { label: root.name, index: -1 },
        ...zoomStack.map((frame, idx) => ({ label: frame.label, index: idx })),
    ];
    const childCount = (currentRoot.children ?? []).length;
    const rootShare = formatShare(currentRoot.value, totalValue);
    const legend = colorBy === "branch" ? (root.children ?? []) : [];

    const mergedStyle: CSSProperties = { width, ...style };

    return (
        <div className={`flex min-w-0 flex-col ${className ?? ""}`} style={mergedStyle}>
            {/* Controls: the page's mode switch, then search and reset on the right. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">{toolbar}</div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        aria-label="Search the breakdown"
                        className="h-8 w-40 rounded-md border border-(--card-stroke) bg-card px-3 text-xs text-foreground placeholder:text-(--ink-muted)"
                    />
                    {(zoomStack.length > 0 || searchQuery) && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="h-8 rounded-md border border-(--card-stroke) bg-card px-3 text-xs text-(--accent-2)"
                        >
                            {CTA_LABELS.reset}
                        </button>
                    )}
                </div>
            </div>

            {/* Title row: the shown root (the way back when zoomed), its total and its children. */}
            <div
                data-testid="flame-title-row"
                className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-3.75"
            >
                <nav aria-label="Breakdown path" className="flex min-w-0 items-center gap-1">
                    {breadcrumbs.map((crumb, idx) => {
                        const isCurrent = idx === breadcrumbs.length - 1;
                        return (
                            <span
                                key={`${crumb.label}-${crumb.index}`}
                                className="flex min-w-0 items-center gap-1"
                            >
                                {idx > 0 && <span className="text-(--ink-muted)">/</span>}
                                {isCurrent ? (
                                    <strong
                                        aria-current="location"
                                        className="truncate text-sm font-semibold text-foreground"
                                    >
                                        {crumb.label}
                                    </strong>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleZoomOut(crumb.index + 1)}
                                        className="truncate text-sm text-(--accent-2) hover:underline"
                                    >
                                        {crumb.label}
                                    </button>
                                )}
                            </span>
                        );
                    })}
                </nav>
                <span data-testid="flame-summary" className="text-xs text-(--ink-muted)">
                    Total {formatAmount(currentRoot.value, unit)} ·{" "}
                    {childCount === 1 ? "1 child" : `${childCount} children`}
                </span>
            </div>

            {/* Icicle: the root row, then one row per level. */}
            <div ref={chartRef} data-testid="flame-icicle" className="mt-2 min-w-0">
                <div
                    data-testid="flame-root-row"
                    title={currentRoot.name}
                    className="flex items-center overflow-hidden whitespace-nowrap rounded-xs text-xs text-foreground"
                    style={{
                        height: FLAME_ROW_HEIGHT,
                        marginBottom: FLAME_GAP,
                        paddingInline: LABEL_PAD,
                        backgroundColor: "var(--surface2, var(--card-stroke))",
                    }}
                >
                    <BlockText
                        kind={flameLabel(currentRoot.name, rootShare, layoutWidth + FLAME_GAP)}
                        name={currentRoot.name}
                        share={rootShare}
                    />
                </div>
                {filteredChildren.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-sm text-(--ink-muted)">
                        {searchQuery ? (
                            <span>No matches found for &quot;{searchQuery}&quot;</span>
                        ) : (
                            "No data to display."
                        )}
                    </div>
                ) : (
                    <div className="flex">
                        {filteredChildren.map((child, index) =>
                            renderNode(
                                child,
                                0,
                                index,
                                currentRoot.value,
                                zoomedBranchIndex ?? (root.children ?? []).indexOf(child),
                            ),
                        )}
                    </div>
                )}
            </div>

            {/* Legend: the served top-level branches with their colors. */}
            {legend.length > 0 && (
                <ul
                    data-testid="flame-legend"
                    aria-label="Legend"
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-(--ink-muted)"
                >
                    {legend.map((branch, index) => (
                        <li
                            key={`${branch.name}-${index}`}
                            className="inline-flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden="true"
                                data-testid="flame-legend-swatch"
                                className="size-2.5 shrink-0 rounded-xs"
                                style={{ backgroundColor: branchColor(index) }}
                            />
                            {branch.name}
                        </li>
                    ))}
                </ul>
            )}

            {/* Tooltip */}
            {hoveredNode && (
                <div
                    className="fixed z-50 px-3 py-2 text-xs rounded-lg border border-(--card-stroke) bg-card shadow-lg pointer-events-none max-w-xs"
                    style={{
                        left: tooltipPos.x + 12,
                        top: tooltipPos.y + 12,
                    }}
                >
                    <p className="font-semibold text-foreground truncate">{hoveredNode.name}</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                        <span className="text-(--ink-muted)">Elapsed:</span>
                        <span className="text-foreground font-mono">
                            {formatAmount(hoveredNode.value, unit)}
                        </span>

                        <span className="text-(--ink-muted)">Percent:</span>
                        <span className="text-foreground font-mono">
                            {formatShare(hoveredNode.value, totalValue)}
                        </span>
                    </div>
                    <div className="flex justify-between border-b border-(--card-stroke) pb-1">
                        <span className="text-(--ink-muted)">Total Elapsed</span>
                        <span className="text-foreground font-mono">
                            {formatAmount(totalValue, unit)}
                        </span>
                    </div>
                    {(hoveredNode.children?.length ?? 0) > 0 && (
                        <p className="text-(--accent-2) mt-1 text-xs">Click to zoom in</p>
                    )}
                </div>
            )}
        </div>
    );
}
