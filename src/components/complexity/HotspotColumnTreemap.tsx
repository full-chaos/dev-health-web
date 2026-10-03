"use client";

import { useEffect, useRef, useState } from "react";

import type { TreemapNode } from "@/components/charts/TreemapChart";
import { squarify } from "@/lib/charts/squarify";
import { formatMetricValue, formatNumber } from "@/lib/formatters";

/** A file leaf of the hotspot tree, with the served fields the tooltip shows. */
type HotspotLeaf = TreemapNode & {
    filePath?: string;
    cyclomaticAvg?: number;
    churnLoc30d?: number;
};

type HotspotColumnTreemapProps = {
    /** Root → repositories → files (`buildTreemapData`): file values are the served risk scores. */
    data: TreemapNode;
    /** Drawing height in px (the prototype draws 260). */
    height?: number;
    /** Width in px; measured from the container when left out. */
    width?: number;
};

const HEAD_H = 24;
const COL_GAP = 6;
/** Fill opacity by the cell's rank in its column (prototype `B_OP`). */
const RANK_OPACITY = [1, 0.82, 0.66];
/** About the width of one 12px character (labels are cut to fit, never overflow). */
const CHAR_PX = 6.8;

function fit(text: string, maxPx: number): string {
    const max = Math.floor(maxPx / CHAR_PX);
    if (max < 2) return "";
    return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const scoreText = (value: number) => formatMetricValue(value, "");

export type HotspotCell = {
    item: HotspotLeaf;
    rank: number;
    x: number;
    y: number;
    w: number;
    h: number;
};
export type HotspotColumn = { name: string; x: number; w: number; cells: HotspotCell[] };

/**
 * Layout only: columns in the served repository order, each as wide as its share of the served
 * risk scores (the repository value `buildTreemapData` already sums for the old treemap), with its
 * files squarified inside (largest first, 1px inset per side so cells keep a 2px gap).
 */
export function layoutHotspotColumns(
    data: TreemapNode,
    width: number,
    height: number,
): HotspotColumn[] {
    const groups = (data.children ?? []).filter((group) => group.value > 0);
    const total = groups.reduce((sum, group) => sum + group.value, 0);
    const available = width - COL_GAP * Math.max(0, groups.length - 1);
    const widths = groups.map((group) => (total > 0 ? (available * group.value) / total : 0));
    const starts = widths.map((_, i) =>
        widths.slice(0, i).reduce((sum, colW) => sum + colW + COL_GAP, 0),
    );
    return groups.map((group, i) => {
        const x = starts[i];
        const colW = widths[i];
        const items = [...(group.children ?? [])]
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value) as HotspotLeaf[];
        const rects = squarify(
            items.map((item) => item.value),
            { x: x - 1, y: HEAD_H - 1, w: colW + 2, h: height - HEAD_H + 2 },
        );
        return {
            name: group.name,
            x,
            w: colW,
            cells: items.map((item, rank) => ({
                item,
                rank,
                x: rects[rank].x + 1,
                y: rects[rank].y + 1,
                w: Math.max(0, rects[rank].w - 2),
                h: Math.max(0, rects[rank].h - 2),
            })),
        };
    });
}

/**
 * File hotspots as the approved prototype's rendered `hotspotTreemap()` (charts-b.js): one column
 * per repository with the repository name as its head, each column's width the repository's share
 * of the served risk scores, its files squarified inside the column, each cell labelled top-left
 * with the file name and its served risk score. Layout math only: no total or other number is
 * printed that the API did not serve (the prototype's per-column "risk" sum is left out).
 */
export function HotspotColumnTreemap({ data, height = 260, width }: HotspotColumnTreemapProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = useState(0);
    useEffect(() => {
        if (width !== undefined || !ref.current) return;
        const element = ref.current;
        const update = () => setMeasured(element.clientWidth);
        update();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [width]);
    const w = width ?? measured;

    const columns = layoutHotspotColumns(data, w, height);

    return (
        <div ref={ref} className="w-full" style={{ minHeight: height }}>
            {w > 0 ? (
                <svg
                    width={w}
                    height={height}
                    viewBox={`0 0 ${w} ${height}`}
                    role="img"
                    aria-label="File hotspots grouped by repository, sized by risk score"
                    data-testid="hotspot-column-treemap"
                >
                    {columns.map((column) => (
                        <g key={column.name} data-testid="hotspot-column" data-repo={column.name}>
                            <text
                                x={column.x + 2}
                                y={14}
                                className="fill-foreground text-xs font-medium"
                                data-testid="hotspot-column-head"
                            >
                                {/* The repository name without its owner ("full-chaos/"), as the
                                    prototype heads read; the full name is the tooltip. */}
                                {fit(column.name.split("/").pop() ?? column.name, column.w - 4)}
                                <title>{column.name}</title>
                            </text>
                            {column.cells.map((cell) => {
                                const name = cell.item.name;
                                const label = fit(name, cell.w - 14);
                                const score = scoreText(cell.item.value);
                                const showText = cell.w >= 40 && cell.h >= 20 && label.length > 1;
                                const details = [
                                    cell.item.filePath ?? name,
                                    `Risk score: ${formatNumber(cell.item.value, { maximumFractionDigits: 3 })}`,
                                    typeof cell.item.cyclomaticAvg === "number"
                                        ? `Cyclomatic avg: ${formatNumber(cell.item.cyclomaticAvg)}`
                                        : null,
                                    typeof cell.item.churnLoc30d === "number"
                                        ? `Churn LOC 30d: ${formatNumber(cell.item.churnLoc30d)}`
                                        : null,
                                ].filter(Boolean);
                                return (
                                    <g
                                        key={`${column.name}/${cell.item.filePath ?? name}/${cell.rank}`}
                                        data-testid="hotspot-cell"
                                        data-rank={cell.rank}
                                    >
                                        <title>{details.join("\n")}</title>
                                        <rect
                                            x={cell.x}
                                            y={cell.y}
                                            width={cell.w}
                                            height={cell.h}
                                            rx={3}
                                            fill="var(--chart-color-1)"
                                            fillOpacity={RANK_OPACITY[Math.min(cell.rank, 2)]}
                                        />
                                        {showText ? (
                                            <text
                                                className="pointer-events-none fill-white text-xs font-semibold"
                                                data-testid="hotspot-cell-label"
                                            >
                                                <tspan
                                                    x={cell.x + 7}
                                                    y={
                                                        cell.y +
                                                        (cell.h >= 40 ? 17 : cell.h / 2 + 4)
                                                    }
                                                >
                                                    {label}
                                                </tspan>
                                                {cell.h >= 40 ? (
                                                    <tspan
                                                        x={cell.x + 7}
                                                        y={cell.y + 31}
                                                        className="font-normal"
                                                    >
                                                        {score}
                                                    </tspan>
                                                ) : null}
                                            </text>
                                        ) : null}
                                    </g>
                                );
                            })}
                        </g>
                    ))}
                </svg>
            ) : null}
        </div>
    );
}
