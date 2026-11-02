"use client";

import type { RenderShape, ShapeSlot } from "@full-chaos/ask-dev/render";
import dynamic from "next/dynamic";

import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import { buildTooltipHtml } from "@/lib/chartUtils";
import { formatNumber } from "@/lib/formatters";
import type { SankeyLink, SankeyNode } from "@/lib/types";

/** On demand: an answer with no rich shape loads no chart. */
const TreemapChart = dynamic(
    async () => (await import("@/components/charts/TreemapChart")).TreemapChart,
    { ssr: false },
);

/** On demand, as the treemap: an answer with no sankey loads no sankey module. */
const SankeyChart = dynamic(
    async () => (await import("@/components/charts/SankeyChart")).SankeyChart,
    { ssr: false },
);

const TREEMAP_HEIGHT = 260;
const SANKEY_HEIGHT = 360;

/**
 * The theme column's labels sit inside the chart, left of their nodes: in the panel at phone
 * width the default right-hand labels fall off the canvas, and the reader loses the theme words.
 */
const SANKEY_LABELS = [{ depth: 1, position: "left" }] as const;

type Tile = { readonly name?: string; readonly value?: number };

/** A served ratio as a reader's share. Only the format: the number stays the shape's own. */
function shareText(value: number | undefined): string {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

/**
 * A served effort as text: one decimal, and a value above 0 that would round to 0 reads "<0.1"
 * (a small repository's link is real effort, never "0"). Only the format: the number stays the
 * shape's own.
 */
function effortText(value: number): string {
    const shown = formatNumber(value, { maximumFractionDigits: 1 });
    return value > 0 && Number(shown) === 0 ? "<0.1" : shown;
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

/** A sankey's graph: its nodes, its links, and the served word of each node id. */
type FlowGraph = {
    readonly nodes: SankeyNode[];
    readonly links: SankeyLink[];
    readonly words: ReadonlyMap<string, string>;
};

/**
 * One team's repository → theme flows from a verified `investment_repository_flow` shape
 * (CHAOS-12579): a series is a theme, and a point is one repository's link into it, labelled with
 * the repository's served word. Node ids are the adapter's own, so a repository word and a theme
 * word never share a key. A zero link draws nothing and stays in ask-dev's value table. Null when
 * fewer than 2 repositories carry effort: there is no flow to draw.
 */
function flowGraph(shape: RenderShape): FlowGraph | null {
    const words = new Map<string, string>();
    const repositories: SankeyNode[] = [];
    const themes: SankeyNode[] = [];
    const links: SankeyLink[] = [];
    for (const series of shape.series) {
        const theme = `theme:${series.key}`;
        for (const point of series.points) {
            if (!(point.value > 0)) continue;
            const repository = `repository:${point.label}`;
            if (!words.has(repository)) {
                words.set(repository, point.label);
                repositories.push({ id: repository, name: point.label, group: "repository" });
            }
            if (!words.has(theme)) {
                words.set(theme, series.label);
                themes.push({ id: theme, name: series.label, group: "theme" });
            }
            links.push({ source: repository, target: theme, value: point.value });
        }
    }
    if (repositories.length < 2) return null;
    return { nodes: [...repositories, ...themes], links, words };
}

/** What ECharts passes a sankey tooltip: a link (`edge`) or a node, by the adapter's node ids. */
type FlowItem = {
    readonly dataType?: string;
    readonly data?: {
        readonly name?: string;
        readonly source?: string;
        readonly target?: string;
        readonly value?: number;
    };
    readonly name?: string;
    readonly value?: number;
};

function AskDevSankey({
    shape,
    graph,
}: {
    readonly shape: RenderShape;
    readonly graph: FlowGraph;
}) {
    const reduceMotion = usePrefersReducedMotion();
    const word = (id: string | undefined) => (id === undefined ? "" : (graph.words.get(id) ?? ""));
    return (
        <SankeyChart
            animation={!reduceMotion}
            height={SANKEY_HEIGHT}
            labelPositionByDepth={SANKEY_LABELS}
            links={graph.links}
            nodes={graph.nodes}
            tooltipFormatterAction={(params) => {
                const item = (params ?? {}) as FlowItem;
                const data = item.data ?? {};
                const link = item.dataType === "edge";
                const value = link ? data.value : (item.value ?? data.value);
                return buildTooltipHtml({
                    title: link
                        ? `${word(data.source)} → ${word(data.target)}`
                        : word(data.name ?? item.name),
                    value: effortText(typeof value === "number" ? value : 0),
                    unit: shape.value_label,
                });
            }}
            verbatimNodeNames
        />
    );
}

/**
 * ask-dev's `slots.shape`: maps a verified shape to the props of web's existing chart. It draws
 * nothing itself. Words come from the shape, and numbers from the shape: the formatters read each
 * tile's or link's own value, so the chart derives no percent from a total. A shape it cannot draw
 * gets `null`, never an element that draws nothing, because ask-dev shows its value table only for
 * `null` (CHAOS-12538).
 */
export const askDevShapeChart: ShapeSlot = (shape) => {
    if (shape.kind === "sankey") {
        // A sankey plots weighted effort, which has no unit (CHAOS-12578).
        if (shape.value_unit !== undefined) return null;
        const graph = flowGraph(shape);
        return graph === null ? null : <AskDevSankey graph={graph} shape={shape} />;
    }
    if (shape.kind !== "treemap" || shape.value_unit !== "ratio") return null;
    const points = shape.series[0]?.points ?? [];
    if (points.filter((point) => point.value > 0).length < 2) return null;
    return <AskDevTreemap shape={shape} />;
};
