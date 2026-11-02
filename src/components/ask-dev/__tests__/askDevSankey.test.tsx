import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SankeyLink, SankeyNode } from "@/lib/types";

import { askDevShapeChart } from "../askDevShapeCharts";

type ChartProps = {
    readonly nodes: SankeyNode[];
    readonly links: SankeyLink[];
    readonly animation?: boolean;
    readonly verbatimNodeNames?: boolean;
    readonly tooltipFormatterAction: (params: unknown, unit: string) => string;
};

const chart = vi.hoisted(() => ({ loads: 0, props: undefined as unknown }));

vi.mock("@/components/charts/SankeyChart", () => {
    chart.loads += 1;
    return {
        SankeyChart: (props: unknown) => {
            chart.props = props;
            return <div data-testid="sankey" />;
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

/**
 * A verified sankey: ask-dev's fixture, built through acr's real vocabulary labels, `Validate` and
 * encoder (CHAOS-12579). No acr producer emits the rule yet (CHAOS-12582).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/repository-flow-sankey.json",
        ),
        "utf8",
    ),
) as { render_shapes: RenderShape[] };
const sankey = answer.render_shapes.find((shape) => shape.kind === "sankey")!;

async function drawn(shape: RenderShape = sankey): Promise<ChartProps> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("sankey");
    return chart.props as ChartProps;
}

function changed(change: (shape: RenderShape) => void): RenderShape {
    const shape = structuredClone(sankey);
    change(shape);
    return shape;
}

const flows = sankey.series.flatMap((series) =>
    series.points.map((point) => ({ theme: series, point })),
);

describe("the host's sankey for a verified shape (CHAOS-12581)", () => {
    it("the fixture is the case: repositories that flow into several themes", () => {
        expect(sankey.selected_by).toBe("investment_repository_flow");
        const words = new Set(flows.map(({ point }) => point.label));
        expect(words.size).toBeGreaterThanOrEqual(2);
        expect(flows.length).toBeGreaterThan(words.size);
    });

    it("draws one node per repository word and one per theme, named by the served words", async () => {
        const props = await drawn();
        const repositories = [...new Set(flows.map(({ point }) => point.label))];
        expect(
            props.nodes.filter((node) => node.group === "repository").map((n) => n.name),
        ).toEqual(repositories);
        expect(props.nodes.filter((node) => node.group === "theme").map((n) => n.name)).toEqual(
            sankey.series.map((series) => series.label),
        );
        expect(new Set(props.nodes.map((node) => node.id)).size).toBe(props.nodes.length);
    });

    it("links each repository to its theme with the point's exact value", async () => {
        const props = await drawn();
        const name = new Map(props.nodes.map((node) => [node.id!, node.name]));
        expect(
            props.links.map((link) => [name.get(link.source), name.get(link.target), link.value]),
        ).toEqual(flows.map(({ theme, point }) => [point.label, theme.label, point.value]));
    });

    it("keeps the served words as given: no entity-label rewrite", async () => {
        expect((await drawn()).verbatimNodeNames).toBe(true);
    });

    it("leaves a zero link to the value table", async () => {
        const shape = changed((s) => {
            s.series[0]!.points.push({ ...s.series[0]!.points[0]!, label: "acme/zero", value: 0 });
        });
        const props = await drawn(shape);
        expect(props.nodes.map((node) => node.name)).not.toContain("acme/zero");
        expect(props.links.every((link) => link.value > 0)).toBe(true);
    });

    it("escapes a hostile label in the tooltip", async () => {
        const hostile = '<img src=x onerror="alert(1)">';
        const props = await drawn(changed((s) => void (s.series[0]!.points[0]!.label = hostile)));
        const id = props.nodes.find((node) => node.name === hostile)!.id;
        const html = props.tooltipFormatterAction(
            { dataType: "node", data: { name: id }, value: 1 },
            "",
        );
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
    });

    it("names a link's two ends and its served value word in the tooltip", async () => {
        const props = await drawn();
        const [link] = props.links;
        const html = props.tooltipFormatterAction(
            { dataType: "edge", data: { source: link!.source, target: link!.target, value: 40 } },
            "",
        );
        expect(html).toContain(flows[0]!.point.label);
        expect(html).toContain(flows[0]!.theme.label);
        expect(html).toContain(sankey.value_label);
        expect(html).toContain("40");
    });

    it("shows a small value as <0.1, never as 0", async () => {
        const props = await drawn();
        const html = props.tooltipFormatterAction(
            { dataType: "edge", data: { ...props.links[0], value: 0.004 } },
            "",
        );
        expect(html).toContain("&lt;0.1");
    });

    it("animates by default, and not under reduced motion", async () => {
        expect((await drawn()).animation).toBe(true);
        cleanup();
        motion.reduced = true;
        expect((await drawn()).animation).toBe(false);
    });
});

describe("the adapter returns null when it cannot draw a sankey (CHAOS-12538)", () => {
    it.each<[string, RenderShape]>([
        ["a value unit", changed((shape) => void (shape.value_unit = "ratio"))],
        [
            "one repository with effort",
            changed((shape) => {
                for (const series of shape.series) {
                    for (const point of series.points) point.label = "acme/only";
                }
            }),
        ],
        [
            "no link above 0",
            changed((shape) => {
                for (const series of shape.series) {
                    for (const point of series.points) point.value = 0;
                }
            }),
        ],
        ["no series", changed((shape) => void (shape.series = [] as never))],
    ])("%s", (_, shape) => {
        expect(askDevShapeChart(shape)).toBeNull();
    });
});

describe("the sankey loads on demand (CHAOS-12581)", () => {
    it("loads the sankey module only when a sankey draws", async () => {
        // A fresh module graph: the renders above already loaded the chart, so a count taken after
        // them could not tell a static import from a lazy one.
        // vi.resetModules keeps a hoisted mock's module, so the count comes from a fresh doMock.
        vi.resetModules();
        let loads = 0;
        vi.doMock("@/components/charts/SankeyChart", () => {
            loads += 1;
            return { SankeyChart: () => <div data-testid="sankey-fresh" /> };
        });
        const fresh = await import("../askDevShapeCharts");
        expect(fresh.askDevShapeChart(changed((shape) => void (shape.kind = "series")))).toBeNull();
        expect(loads).toBe(0);
        render(fresh.askDevShapeChart(sankey) as ReactElement);
        await screen.findByTestId("sankey-fresh");
        expect(loads).toBe(1);
    });
});
