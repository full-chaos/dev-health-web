import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SunburstNode } from "@/components/charts/SunburstChart";

import { askDevShapeChart } from "../askDevShapeCharts";

type ChartProps = {
    readonly data: SunburstNode;
    readonly animation?: boolean;
    readonly useInputColors?: boolean;
    readonly tooltipFormatterAction: (params: unknown, total: number, unit: string) => string;
};

const chart = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock("@/components/charts/SunburstChart", () => ({
    SunburstChart: (props: unknown) => {
        chart.props = props;
        return <div data-testid="sunburst" />;
    },
}));

// The real theme-color rule, with the fixed palette tokens: jsdom has no media queries to watch.
vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return {
        ...actual,
        useChartTokens: () => actual.fallbackTokens,
        useChartColors: () => ["#000001", "#000002"],
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

/**
 * A verified sunburst: ask-dev's fixture, built through acr's real vocabulary labels, `Validate`
 * and encoder at the contract commit (CHAOS-12812). No acr producer emits the rule yet (CHAOS-12554).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/investment-sunburst.json",
        ),
        "utf8",
    ),
) as { render_shapes: RenderShape[] };
const sunburst = answer.render_shapes[0]!;
const [inner, ...rings] = sunburst.series;

async function drawn(shape: RenderShape = sunburst): Promise<ChartProps> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("sunburst");
    return chart.props as ChartProps;
}

function changed(change: (shape: RenderShape) => void): RenderShape {
    const shape = structuredClone(sunburst);
    change(shape);
    return shape;
}

describe("the host's sunburst for a verified shape (CHAOS-12813)", () => {
    it("the fixture is the case: an inner ring of themes and one ring per theme", () => {
        expect(sunburst.selected_by).toBe("investment_subcategory_share");
        expect(inner!.key).toBe("themes");
        expect(rings).toHaveLength(inner!.points.length);
        expect(rings.flatMap((ring) => ring.points).some((point) => point.value === 0)).toBe(true);
    });

    it("maps each theme and its subcategories with the served words and exact values", async () => {
        const { data } = await drawn();
        expect(data.name).toBe(sunburst.title);
        const expected = inner!.points
            .filter((point) => point.value > 0)
            .map((point) => {
                const ring = rings.find((entry) => entry.label === point.label)!;
                return {
                    name: point.label,
                    value: point.value,
                    children: ring.points
                        .filter((leaf) => leaf.value > 0)
                        .map((leaf) => ({ name: leaf.label, value: leaf.value })),
                };
            });
        const drawnNodes = (data.children ?? []).map((theme) => ({
            name: theme.name,
            value: theme.value,
            children: (theme.children ?? []).map((leaf) => ({
                name: leaf.name,
                value: leaf.value,
            })),
        }));
        expect(drawnNodes).toEqual(expected);
    });

    it("keeps the served words as given: no rewrite", async () => {
        const { data } = await drawn();
        const names = (data.children ?? []).flatMap((theme) => [
            theme.name,
            ...(theme.children ?? []).map((leaf) => leaf.name),
        ]);
        expect(names).toContain("Bugfix");
        expect(names).toContain("Operational / Support");
    });

    it("leaves a measured zero to the value table", async () => {
        const { data } = await drawn();
        const values = (data.children ?? []).flatMap((theme) => [
            theme.value,
            ...(theme.children ?? []).map((leaf) => leaf.value),
        ]);
        expect(values.every((value) => value > 0)).toBe(true);
    });

    it("escapes a hostile label in the tooltip", async () => {
        const { tooltipFormatterAction } = await drawn();
        const hostile = '<img src=x onerror="alert(1)">';
        const html = tooltipFormatterAction(
            {
                data: { name: hostile, value: 0.1 },
                treePathInfo: [{ name: "t" }, { name: hostile }],
            },
            1,
            "",
        );
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
    });

    it("shows the share, the theme above a subcategory and the served value word", async () => {
        const { tooltipFormatterAction } = await drawn();
        const html = tooltipFormatterAction(
            {
                data: { name: "Bugfix", value: 0.2 },
                treePathInfo: [
                    { name: sunburst.title },
                    { name: "Quality / Reliability" },
                    { name: "Bugfix" },
                ],
            },
            1,
            "",
        );
        expect(html).toContain("20.0%");
        expect(html).toContain("Quality / Reliability");
        expect(html).toContain(sunburst.value_label);
    });

    it("colors each theme and its subcategories by the theme's token, as the investment page", async () => {
        const { fallbackTokens } = await import("@/components/charts/chartTheme");
        const { data } = await drawn();
        const feature = (data.children ?? []).find(
            (theme) => theme.themeKey === "feature_delivery",
        )!;
        expect(feature.itemStyle?.color).toBe(fallbackTokens.themeFeature);
        for (const leaf of feature.children ?? []) {
            expect(leaf.itemStyle?.color).toBe(fallbackTokens.themeFeature);
        }
        const quality = (data.children ?? []).find((theme) => theme.themeKey === "quality")!;
        expect(quality.itemStyle?.color).toBe(fallbackTokens.themeQuality);
    });

    it("animates by default, and not under reduced motion", async () => {
        expect((await drawn()).animation).toBe(true);
        cleanup();
        motion.reduced = true;
        expect((await drawn()).animation).toBe(false);
    });
});

describe("the adapter returns null when it cannot draw a sunburst (CHAOS-12538)", () => {
    it.each<[string, RenderShape]>([
        ["no ratio unit", changed((shape) => void delete shape.value_unit)],
        ["no inner ring", changed((shape) => void (shape.series[0]!.key = "theme"))],
        ["no ring", changed((shape) => void (shape.series = [shape.series[0]!] as never))],
        [
            "an inner point with no ring",
            changed((shape) => void (shape.series[0]!.points[0]!.label = "Nowhere")),
        ],
        ["a ring with no inner point", changed((shape) => void shape.series[0]!.points.pop())],
        [
            "two rings with one word",
            changed((shape) => void (shape.series[2]!.label = shape.series[1]!.label)),
        ],
        [
            "a value that is not finite",
            changed((shape) => void (shape.series[1]!.points[0]!.value = Number.NaN)),
        ],
        [
            "one subcategory above 0",
            changed((shape) => {
                let kept = false;
                for (const ring of shape.series.slice(1)) {
                    for (const point of ring.points) {
                        if (point.value > 0 && !kept) kept = true;
                        else point.value = 0;
                    }
                }
            }),
        ],
    ])("%s", (_, shape) => {
        expect(askDevShapeChart(shape)).toBeNull();
    });
});

describe("the adapter never throws on a malformed sunburst (codex r1 on #1797)", () => {
    it.each<[string, RenderShape]>([
        [
            "no series at all",
            changed((shape) => void delete (shape as { series?: unknown }).series),
        ],
        [
            "an inner ring with no points",
            changed((shape) => void delete (shape.series[0] as { points?: unknown }).points),
        ],
        [
            "a ring with no points",
            changed((shape) => void delete (shape.series[1] as { points?: unknown }).points),
        ],
    ])("%s", (_, shape) => {
        expect(() => askDevShapeChart(shape)).not.toThrow();
        expect(askDevShapeChart(shape)).toBeNull();
    });
});

describe("the sunburst loads on demand (CHAOS-12813)", () => {
    it("loads the sunburst module only when a sunburst draws", async () => {
        // A fresh module graph, as for the treemap and the sankey: the renders above already loaded
        // the chart, so a count taken after them would pass with a static import too.
        vi.resetModules();
        let loads = 0;
        vi.doMock("@/components/charts/SunburstChart", () => {
            loads += 1;
            return { SunburstChart: () => <div data-testid="sunburst-fresh" /> };
        });
        const fresh = await import("../askDevShapeCharts");
        expect(fresh.askDevShapeChart(changed((shape) => void (shape.kind = "series")))).toBeNull();
        expect(loads).toBe(0);
        render(fresh.askDevShapeChart(sunburst) as ReactElement);
        await screen.findByTestId("sunburst-fresh");
        expect(loads).toBe(1);
    });
});
