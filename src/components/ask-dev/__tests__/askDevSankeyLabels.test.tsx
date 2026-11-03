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

function liveShape(): RenderShape {
    const shape = structuredClone(base);
    const template = base.series[0]!.points[0]!;
    shape.series = THEMES.map(([key, label, share]) => ({
        ...structuredClone(base.series[0]!),
        key,
        label,
        points: REPOSITORIES.map(([word, effort], index) => ({
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

/** The labels ECharts draws for the option at one width: each a box in canvas pixels. */
async function labelsAt(
    width: number,
    shape = liveShape(),
): Promise<{ boxes: Box[]; height: number }> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("chart");
    const option = caught.option as echarts.EChartsCoreOption;
    const height = 360;
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    try {
        chart.setOption({ ...option, animation: false });
        const boxes = (chart as unknown as Scene)
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
                return {
                    text: el.style!.text!,
                    x: rect.x,
                    y: rect.y,
                    w: rect.width,
                    h: rect.height,
                };
            });
        return { boxes, height };
    } finally {
        chart.dispose();
    }
}

function overlaps(a: Box, b: Box): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("the team sankey's labels at narrow width (CHAOS-12872)", () => {
    it("the case is real: the scene has a label per node at desktop width", async () => {
        const { boxes } = await labelsAt(728);
        expect(boxes.map((box) => box.text)).toEqual(
            expect.arrayContaining(["full-chaos/dev-health-ops", "Quality / Reliability"]),
        );
        expect(boxes.length).toBe(REPOSITORIES.length + THEMES.length);
    });

    for (const width of [300, 324, 329]) {
        it(`no two drawn labels overlap, and each stays on the canvas, at ${String(width)} px`, async () => {
            const { boxes } = await labelsAt(width);
            const pairs = boxes.flatMap((a, i) =>
                boxes
                    .slice(i + 1)
                    .filter((b) => overlaps(a, b))
                    .map((b) => `${a.text} × ${b.text}`),
            );
            expect(pairs, "overlapping labels").toEqual([]);
            const off = boxes
                .filter((box) => box.x < 0 || box.x + box.w > width)
                .map((box) => box.text);
            expect(off, "labels off the canvas").toEqual([]);
            // A label gives way only to a larger node's: the two largest repositories and every
            // theme keep their words, so the fix never hides the chart's own story.
            expect(boxes.map((box) => box.text)).toEqual(
                expect.arrayContaining([
                    "full-chaos/dev-health-ops",
                    "full-chaos/dev-health-acr",
                    ...THEMES.map(([, label]) => label),
                ]),
            );
        });
    }
});
