"use client";

import type { RenderShape, ShapeSlot } from "@full-chaos/ask-dev/render";
import dynamic from "next/dynamic";

import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import { buildTooltipHtml } from "@/lib/chartUtils";

/** On demand: an answer with no rich shape loads no chart. */
const TreemapChart = dynamic(
    async () => (await import("@/components/charts/TreemapChart")).TreemapChart,
    { ssr: false },
);

const TREEMAP_HEIGHT = 260;

type Tile = { readonly name?: string; readonly value?: number };

/** A served ratio as a reader's share. Only the format: the number stays the shape's own. */
function shareText(value: number | undefined): string {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function AskDevTreemap({ shape }: { readonly shape: RenderShape }) {
    const reduceMotion = usePrefersReducedMotion();
    const series = shape.series[0]!;
    // A measured 0 has no area, so it stays in ask-dev's value table.
    const children = series.points
        .filter((point) => point.value > 0)
        .map((point) => ({ name: point.label, value: point.value }));
    return (
        <TreemapChart
            animation={!reduceMotion}
            data={{
                name: shape.title,
                value: children.reduce((sum, tile) => sum + tile.value, 0),
                children,
            }}
            height={TREEMAP_HEIGHT}
            labelFormatterAction={(params) => {
                const tile = params as Tile;
                return `${tile.name ?? ""}\n${shareText(tile.value)}`;
            }}
            showBreadcrumb={false}
            tooltipFormatterAction={(params) => {
                const tile = params as Tile;
                return buildTooltipHtml({
                    title: tile.name ?? "",
                    value: shareText(tile.value),
                    unit: series.label,
                });
            }}
        />
    );
}

/**
 * ask-dev's `slots.shape`: maps a verified shape to the props of web's existing chart. It draws
 * nothing itself. Words come from the shape, and numbers from the shape: the formatters read each
 * tile's own value, so the chart derives no percent from a total. A shape it cannot draw gets `null`,
 * never an element that draws nothing, because ask-dev shows its value table only for `null`
 * (CHAOS-12538).
 */
export const askDevShapeChart: ShapeSlot = (shape) => {
    if (shape.kind !== "treemap" || shape.value_unit !== "ratio") return null;
    const points = shape.series[0]?.points ?? [];
    if (points.filter((point) => point.value > 0).length < 2) return null;
    return <AskDevTreemap shape={shape} />;
};
