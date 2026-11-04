"use client";

import type { ForecastShapeDetail, RenderShape, ShapeSlot } from "@full-chaos/ask-dev/render";
import dynamic from "next/dynamic";

import { completionRangeView } from "@/components/capacity/completionRangeView";
import type { SunburstNode } from "@/components/charts/SunburstChart";
import {
    investmentThemeColor,
    useChartColors,
    useChartTokens,
} from "@/components/charts/chartTheme";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import { buildTooltipHtml } from "@/lib/chartUtils";
import { formatNumber } from "@/lib/formatters";
import type { QuadrantPoint, QuadrantResponse, SankeyLink, SankeyNode } from "@/lib/types";

import { forecastScopeNote, forecastSlotInput } from "./forecastSlotInput";

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

/** On demand, as the treemap: an answer with no sunburst loads no sunburst module. */
const SunburstChart = dynamic(
    async () => (await import("@/components/charts/SunburstChart")).SunburstChart,
    { ssr: false },
);

/** On demand, as the treemap: an answer with no quadrant loads no quadrant module. */
const QuadrantChart = dynamic(
    async () => (await import("@/components/charts/QuadrantChart")).QuadrantChart,
    { ssr: false },
);

/** On demand, as the treemap: the capacity page's own figure, chart and words (CHAOS-4613). */
const CompletionRangeFigure = dynamic(
    async () => (await import("@/components/capacity/CompletionRange")).CompletionRangeFigure,
    { ssr: false },
);

const TREEMAP_HEIGHT = 260;
const QUADRANT_HEIGHT = 320;
const SANKEY_HEIGHT = 360;
const SUNBURST_HEIGHT = 360;

/** acr's `ContextFabricRenderSunburstThemeSeriesKey`: the series of the inner ring. */
const SUNBURST_THEME_SERIES_KEY = "themes";

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
            // In the panel and at phone width the two columns' labels meet in the middle; the
            // smaller node's label gives way, and the value table keeps every word (CHAOS-12872).
            hideOverlappingLabels
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
 * The two rings of a verified `investment_subcategory_share` shape (CHAOS-12813). The series keyed
 * `themes` is the inner ring, one point per theme with its served share; every other series is one
 * theme's ring, labelled with the theme's served word, one point per subcategory with its served
 * share and word. ask-dev's verifier holds an inner point's word and its ring's word to the same
 * theme, so a ring is found by that word. Names are the served words as given, and values the
 * shape's own. A measured 0 has no angle, so it stays in ask-dev's value table. Null when the rings
 * cannot be read that way: no inner ring, a ring with no inner point or one twice, a value that is
 * not finite, or fewer than 2 subcategories above 0.
 */
function sunburstData(shape: RenderShape): SunburstNode | null {
    // A malformed shape is refused here, never thrown on: ask-dev then shows its table. Every
    // series and every point must be an object, and every series must hold points: an empty ring
    // would draw a theme with no subcategories.
    const isObject = (value: unknown): value is object =>
        typeof value === "object" && value !== null;
    const series: readonly unknown[] = Array.isArray(shape.series) ? shape.series : [];
    const readable = series.every((entry) => {
        const points: unknown = isObject(entry)
            ? (entry as { points?: unknown }).points
            : undefined;
        return Array.isArray(points) && points.length > 0 && points.every(isObject);
    });
    if (!readable) return null;
    const [inner, ...rings] = series as RenderShape["series"];
    if (inner?.key !== SUNBURST_THEME_SERIES_KEY || rings.length === 0) return null;
    const ringByWord = new Map(rings.map((ring) => [ring.label, ring] as const));
    if (ringByWord.size !== rings.length || inner.points.length !== rings.length) return null;
    const themes: SunburstNode[] = [];
    const used = new Set<string>();
    let subcategories = 0;
    for (const point of inner.points) {
        const ring = ringByWord.get(point.label);
        if (ring === undefined || used.has(point.label) || !Number.isFinite(point.value)) {
            return null;
        }
        used.add(point.label);
        const children: SunburstNode[] = [];
        for (const leaf of ring.points) {
            if (!Number.isFinite(leaf.value)) return null;
            if (leaf.value > 0) children.push({ name: leaf.label, value: leaf.value });
        }
        subcategories += children.length;
        if (point.value > 0) {
            themes.push({ name: point.label, value: point.value, themeKey: ring.key, children });
        }
    }
    if (subcategories < 2) return null;
    return {
        name: shape.title,
        value: themes.reduce((sum, theme) => sum + theme.value, 0),
        children: themes,
    };
}

/** What ECharts passes a sunburst tooltip: the segment, and the names on its path. */
type SunburstItem = {
    readonly data?: { readonly name?: string; readonly value?: number };
    readonly treePathInfo?: ReadonlyArray<{ readonly name?: string }>;
};

function AskDevSunburst({
    shape,
    data,
}: {
    readonly shape: RenderShape;
    readonly data: SunburstNode;
}) {
    const reduceMotion = usePrefersReducedMotion();
    const tokens = useChartTokens();
    const chartColors = useChartColors();
    // Each theme and its subcategories in the theme's fixed color, as the investment page draws
    // them (by the theme's token, never by rank); the outer ring is told apart by its opacity.
    const colored: SunburstNode = {
        ...data,
        children: (data.children ?? []).map((theme, index) => {
            const color = investmentThemeColor(
                typeof theme.themeKey === "string" ? theme.themeKey : "",
                tokens,
                chartColors[index % chartColors.length] ?? tokens.themeOperational,
            );
            return {
                ...theme,
                itemStyle: { color },
                children: (theme.children ?? []).map((leaf) => ({
                    ...leaf,
                    itemStyle: { color, opacity: 0.75 },
                })),
            };
        }),
    };
    return (
        <SunburstChart
            animation={!reduceMotion}
            data={colored}
            useInputColors
            height={SUNBURST_HEIGHT}
            tooltipFormatterAction={(params) => {
                const item = (params ?? {}) as SunburstItem;
                const name = item.data?.name ?? "";
                // The theme above a subcategory, by its served word; the root is the chart's title.
                const path = (item.treePathInfo ?? []).slice(1).map((step) => step.name ?? "");
                const parent = path.length > 1 ? path[path.length - 2] : undefined;
                return buildTooltipHtml({
                    title: name,
                    ...(parent === undefined ? {} : { subtitle: parent }),
                    value: shareText(item.data?.value),
                    unit: shape.value_label,
                });
            }}
        />
    );
}

/**
 * Where teams stand on two measures on one day, from a verified `landscape_position` shape
 * (CHAOS-12625): series 0 is x and series 1 is y, a point is one team, labelled with its served
 * word. The axes carry the served words, which hold the unit, so `unit` is empty. A point's id is
 * its x claim's id. The values are the shape's own, unchanged. Null when the series cannot be read
 * as one point per team: not two series, fewer than 2 points, a length or label mismatch, or a
 * value that is not finite.
 */
function quadrantData(shape: RenderShape): QuadrantResponse | null {
    const [x, y, ...more] = shape.series;
    if (x === undefined || y === undefined || more.length > 0) return null;
    if (x.points.length < 2 || x.points.length !== y.points.length) return null;
    const points: QuadrantPoint[] = [];
    for (const [index, xPoint] of x.points.entries()) {
        const yPoint = y.points[index]!;
        if (xPoint.label !== yPoint.label) return null;
        if (!Number.isFinite(xPoint.value) || !Number.isFinite(yPoint.value)) return null;
        points.push({
            entity_id: xPoint.source.claim_id ?? xPoint.label,
            entity_label: xPoint.label,
            x: xPoint.value,
            y: yPoint.value,
            // QuadrantChart reads none of these: no window, no evidence link of its own.
            window_start: "",
            window_end: "",
            evidence_link: "",
        });
    }
    return {
        axes: {
            x: { metric: x.key, label: x.label, unit: "" },
            y: { metric: y.key, label: y.label, unit: "" },
        },
        points,
        annotations: [],
    };
}

function AskDevQuadrant({ data }: { readonly data: QuadrantResponse }) {
    const reduceMotion = usePrefersReducedMotion();
    // Raw values only: no zones, no focus, no click action (the quadrant guardrail).
    return (
        <QuadrantChart
            animation={!reduceMotion}
            data={data}
            height={QUADRANT_HEIGHT}
            scopeType="team"
            showClickHint={false}
            verbatimEntityLabels
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
export const askDevShapeChart: ShapeSlot = (shape, detail?: ForecastShapeDetail) => {
    if (shape.kind === "forecast") {
        // The capacity page's mapping, through the slot's own adapter: one copy of the rules.
        if (detail?.kind !== "forecast") return null;
        const view = completionRangeView(forecastSlotInput(detail));
        if (!view.reported) return null;
        const scopeNote = forecastScopeNote(detail.summary);
        return (
            <>
                {scopeNote === undefined ? null : (
                    <p
                        className="mb-2 text-xs text-(--text-muted)"
                        data-testid="forecast-scope-note"
                    >
                        {scopeNote}
                    </p>
                )}
                <CompletionRangeFigure interpolation="step" view={view} />
            </>
        );
    }
    if (shape.kind === "quadrant") {
        // A quadrant's two measures have two units, so it declares none (CHAOS-12623).
        if (shape.value_unit !== undefined) return null;
        const data = quadrantData(shape);
        return data === null ? null : <AskDevQuadrant data={data} />;
    }
    if (shape.kind === "sankey") {
        // A sankey plots weighted effort, which has no unit (CHAOS-12578).
        if (shape.value_unit !== undefined) return null;
        const graph = flowGraph(shape);
        return graph === null ? null : <AskDevSankey graph={graph} shape={shape} />;
    }
    if (shape.kind === "sunburst") {
        // A sunburst plots shares of one whole (CHAOS-12588).
        if (shape.value_unit !== "ratio") return null;
        const data = sunburstData(shape);
        return data === null ? null : <AskDevSunburst data={data} shape={shape} />;
    }
    if (shape.kind !== "treemap" || shape.value_unit !== "ratio") return null;
    const points = shape.series[0]?.points ?? [];
    if (points.filter((point) => point.value > 0).length < 2) return null;
    return <AskDevTreemap shape={shape} />;
};
