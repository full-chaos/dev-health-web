import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { askDevShapeChart } from "../askDevShapeCharts";

type ChartProps = {
    readonly data: { name: string; value: number; children?: { name: string; value: number }[] };
    readonly animation?: boolean;
    readonly showBreadcrumb?: boolean;
    readonly labelFormatterAction: (params: unknown, total: number) => string;
    readonly tooltipFormatterAction: (params: unknown, total: number, unit: string) => string;
};

const chart = vi.hoisted(() => ({ loads: 0, props: undefined as unknown }));

vi.mock("@/components/charts/TreemapChart", () => {
    chart.loads += 1;
    return {
        TreemapChart: (props: unknown) => {
            chart.props = props;
            return <div data-testid="treemap" />;
        },
    };
});

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/a11y/usePrefersReducedMotion", () => ({
    usePrefersReducedMotion: () => motion.reduced,
}));

afterEach(() => {
    cleanup();
    motion.reduced = false;
});

/** A real treemap: ask-dev's fixture from acr's real selector, flag on. */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/investment-treemap.json",
        ),
        "utf8",
    ),
) as { render_shapes: RenderShape[] };
const treemap = answer.render_shapes[0]!;
const points = treemap.series[0]!.points;

async function drawn(shape: RenderShape = treemap): Promise<ChartProps> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("treemap");
    return chart.props as ChartProps;
}

function changed(change: (shape: RenderShape) => void): RenderShape {
    const shape = structuredClone(treemap);
    change(shape);
    return shape;
}

describe("the host's treemap for a verified shape (CHAOS-12496)", () => {
    it("the fixture is the case: a served treemap with a measured zero", () => {
        expect(treemap.kind).toBe("treemap");
        expect(points.map((point) => point.value)).toContain(0);
    });

    it("maps the served labels and values to tiles, and changes neither", async () => {
        const props = await drawn();
        const tiles = points.filter((point) => point.value > 0);
        expect(props.data.children).toEqual(
            tiles.map((point) => ({ name: point.label, value: point.value })),
        );
    });

    it("leaves a measured zero to the value table: a tile cannot draw one", async () => {
        const props = await drawn();
        const zero = points.find((point) => point.value === 0)!;
        expect(props.data.children?.map((tile) => tile.name)).not.toContain(zero.label);
    });

    it("names the root with the served title, and shows no breadcrumb", async () => {
        const props = await drawn();
        expect(props.data.name).toBe(treemap.title);
        expect(props.showBreadcrumb).toBe(false);
    });

    it("draws a share from its own value, never from a total", async () => {
        const props = await drawn();
        const label = props.labelFormatterAction({ name: "Feature Delivery", value: 0.4821 }, 99);
        expect(label).toBe("Feature Delivery\n48.2%");
    });

    it("keeps the served value label out of the tile", async () => {
        const props = await drawn();
        expect(props.labelFormatterAction({ name: "A", value: 0.5 }, 1)).not.toContain("ratio");
    });

    it("escapes a hostile label in the tooltip", async () => {
        const props = await drawn();
        const hostile = '<img src=x onerror="alert(1)">';
        const html = props.tooltipFormatterAction({ name: hostile, value: 0.5 }, 1, "");
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
    });

    it("shows a share and the served series word in the tooltip", async () => {
        const props = await drawn();
        const html = props.tooltipFormatterAction({ name: "Quality", value: 0.1161 }, 1, "");
        expect(html).toContain("11.6%");
        expect(html).toContain(treemap.series[0]!.label);
    });

    it("animates by default, and not under reduced motion", async () => {
        expect((await drawn()).animation).toBe(true);
        cleanup();
        motion.reduced = true;
        expect((await drawn()).animation).toBe(false);
    });
});

describe("the adapter returns null when it cannot draw (CHAOS-12538)", () => {
    it.each<[string, RenderShape]>([
        ["a series shape", changed((shape) => void (shape.kind = "series"))],
        ["another rich kind", changed((shape) => void (shape.kind = "sunburst"))],
        ["no ratio unit", changed((shape) => void delete shape.value_unit)],
        [
            "one tile above 0",
            changed((shape) => {
                for (const [index, point] of shape.series[0]!.points.entries()) {
                    point.value = index === 0 ? 1 : 0;
                }
            }),
        ],
        ["no series", changed((shape) => void (shape.series = [] as never))],
    ])("%s", (_, shape) => {
        expect(askDevShapeChart(shape)).toBeNull();
    });
});

describe("the chart loads on demand (CHAOS-12496)", () => {
    it("loads no chart module for an answer with no rich shape", () => {
        const before = chart.loads;
        expect(askDevShapeChart(changed((shape) => void (shape.kind = "series")))).toBeNull();
        expect(chart.loads).toBe(before);
    });
});
