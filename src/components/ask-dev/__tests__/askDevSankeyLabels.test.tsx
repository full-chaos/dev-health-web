import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import * as echarts from "echarts";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { askDevShapeChart } from "../askDevShapeCharts";

/**
 * CHAOS-12872: the team sankey's labels must not overlap at panel and phone width. The host's real
 * option (SankeyChart's own, caught at the Chart wrapper) is laid out by real ECharts in Node, and
 * the drawn label boxes are read from the scene. A screenshot diff alone cannot say which label
 * hides which; this says it as a check.
 */
const caught = vi.hoisted(() => ({ option: undefined as unknown }));

vi.mock("@/components/charts/Chart", () => ({
    Chart: ({ option }: { option: unknown }) => {
        caught.option = option;
        return <div data-testid="chart" />;
    },
}));

vi.mock("@/lib/a11y/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => true }));

// The chart theme follows the reader's colour scheme; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
})) as typeof window.matchMedia;

afterEach(() => {
    cleanup();
    caught.option = undefined;
});

const fixture = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/repository-flow-sankey.json",
        ),
        "utf8",
    ),
) as { render_shapes: RenderShape[] };
const base = fixture.render_shapes.find((shape) => shape.kind === "sankey")!;

/**
 * The askdev-1 answer of 2026-11-03 (result_dcee4746, team Fullchaos) in its proportions: 8
 * repositories into the 5 themes, one large, one medium, and small ones that sit close together.
 */
const REPOSITORIES: ReadonlyArray<readonly [string, number]> = [
    ["full-chaos/dev-health-ops", 900],
    ["full-chaos/dev-health-acr", 380],
    ["full-chaos/dev-health-web", 120],
    ["full-chaos/dev-health-go", 14],
    ["full-chaos/context-fabric-agents", 9],
    ["full-chaos/ask-dev", 7],
    ["full-chaos/dev-health-deploy", 110],
    ["full-chaos/script-manifest", 5],
];
const THEMES: ReadonlyArray<readonly [string, string, number]> = [
    ["quality_reliability", "Quality / Reliability", 0.55],
    ["feature_delivery", "Feature Delivery", 0.16],
    ["maintenance_tech_debt", "Maintenance / Tech Debt", 0.17],
    ["risk_security", "Risk / Security", 0.06],
    ["operational_support", "Operational / Support", 0.06],
];

function liveShape(repositories = REPOSITORIES): RenderShape {
    const shape = structuredClone(base);
    const template = base.series[0]!.points[0]!;
    shape.series = THEMES.map(([key, label, share]) => ({
        ...structuredClone(base.series[0]!),
        key,
        label,
        points: repositories.map(([word, effort], index) => ({
            ...structuredClone(template),
            label: word,
            value: Number((effort * share).toFixed(3)),
            source: { ...template.source, row_index: index },
        })),
    })) as RenderShape["series"];
    return shape;
}

type Box = {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
};

type Scene = { getZr(): { storage: { getDisplayList(update: boolean): Element[] } } };
type Element = {
    readonly type?: string;
    readonly ignore?: boolean;
    readonly invisible?: boolean;
    readonly style?: { text?: string; opacity?: number };
    getBoundingRect(): { clone(): Rect };
    getComputedTransform(): number[] | null;
};
type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
    applyTransform(m: number[]): void;
};

/** The label boxes of one scene, in canvas pixels. */
function boxesOf(chart: echarts.ECharts): Box[] {
    return (chart as unknown as Scene)
        .getZr()
        .storage.getDisplayList(true)
        .filter(
            (el) =>
                // A zrender Text draws as TSpan displayables; a hidden label draws none.
                el.type === "tspan" &&
                !el.ignore &&
                !el.invisible &&
                (el.style?.opacity ?? 1) > 0 &&
                (el.style?.text ?? "") !== "",
        )
        .map((el) => {
            const rect = el.getBoundingRect().clone();
            const transform = el.getComputedTransform();
            if (transform) rect.applyTransform(transform);
            return { text: el.style!.text!, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        });
}

const HEIGHT = 360;

/** Lays the option out once at one width and returns its label boxes. */
function layOut(option: echarts.EChartsCoreOption, width: number): Box[] {
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height: HEIGHT });
    try {
        chart.setOption({ ...option, animation: false });
        return boxesOf(chart);
    } finally {
        chart.dispose();
    }
}

/**
 * The labels the host's option draws at one width, and every label's box in the same layout with
 * no label hidden (the option without its `labelLayout`): hiding a label moves no other.
 */
async function labelsAt(
    width: number,
    shape = liveShape(),
): Promise<{ boxes: Box[]; every: Box[] }> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("chart", {}, { timeout: 5000 });
    const option = caught.option as echarts.EChartsCoreOption & { series: object[] };
    const unhidden = {
        ...option,
        series: option.series.map((series) => {
            const { labelLayout: _hidden, ...rest } = series as { labelLayout?: unknown };
            return rest;
        }),
    };
    return { boxes: layOut(option, width), every: layOut(unhidden, width) };
}

/** Each node's size by its served word: a repository's effort across themes, a theme's total. */
function nodeSizes(shape: RenderShape): Map<string, number> {
    const sizes = new Map<string, number>();
    for (const series of shape.series) {
        for (const point of series.points) {
            sizes.set(point.label, (sizes.get(point.label) ?? 0) + point.value);
            sizes.set(series.label, (sizes.get(series.label) ?? 0) + point.value);
        }
    }
    return sizes;
}

function overlaps(a: Box, b: Box): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The checks of one narrow width: no two drawn labels overlap, each stays on the canvas, and a
 * label is hidden only where it would overlap a drawn label of a larger node (ECharts ranks labels
 * by their node's area). The largest node keeps its label.
 */
async function expectLegible(width: number, shape: RenderShape) {
    const { boxes, every } = await labelsAt(width, shape);
    const pairs = boxes.flatMap((a, i) =>
        boxes
            .slice(i + 1)
            .filter((b) => overlaps(a, b))
            .map((b) => `${a.text} × ${b.text}`),
    );
    expect(pairs, "overlapping labels").toEqual([]);
    const off = boxes
        .filter((box) => box.x < 0 || box.x + box.w > width || box.y < 0 || box.y + box.h > HEIGHT)
        .map((box) => box.text);
    expect(off, "labels off the canvas").toEqual([]);
    const size = nodeSizes(shape);
    const drawn = new Set(boxes.map((box) => box.text));
    expect(every.length, "the unhidden layout draws every node's label").toBe(size.size);
    const unexplained = every
        .filter((box) => !drawn.has(box.text))
        .filter(
            (hidden) =>
                !boxes.some(
                    (kept) =>
                        overlaps(hidden, kept) &&
                        (size.get(kept.text) ?? 0) >= (size.get(hidden.text) ?? 0),
                ),
        )
        .map((box) => box.text);
    expect(unexplained, "labels hidden with no larger overlapping label").toEqual([]);
    const largest = [...size.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(drawn.has(largest), `the largest node (${largest}) keeps its label`).toBe(true);
    // The case exercises the hiding: at this width some label gives way, so the check above
    // ran on real hidden labels, never on none.
    expect(every.length - boxes.length, "labels hidden at this width").toBeGreaterThan(0);
    return drawn;
}

describe("the team sankey's labels at narrow width (CHAOS-12872)", () => {
    it("the case is real: the scene has a label per node at desktop width, none hidden", async () => {
        const { boxes, every } = await labelsAt(728);
        expect(boxes.map((box) => box.text)).toEqual(
            expect.arrayContaining(["full-chaos/dev-health-ops", "Quality / Reliability"]),
        );
        expect(boxes.length).toBe(REPOSITORIES.length + THEMES.length);
        expect(every.length).toBe(boxes.length);
    });

    for (const width of [300, 324, 329]) {
        it(`the live proportions stay legible at ${String(width)} px, every theme labelled`, async () => {
            const drawn = await expectLegible(width, liveShape());
            expect([...drawn]).toEqual(
                expect.arrayContaining([
                    "full-chaos/dev-health-ops",
                    "full-chaos/dev-health-acr",
                    ...THEMES.map(([, label]) => label),
                ]),
            );
        });

        it(`one dominant repository stays legible at ${String(width)} px`, async () => {
            // A repository larger than every theme: its label outranks a theme label it meets.
            const dominant = REPOSITORIES.map(
                ([word, effort], index) => [word, index === 0 ? effort * 10 : effort] as const,
            );
            await expectLegible(width, liveShape(dominant));
        });
    }
});
