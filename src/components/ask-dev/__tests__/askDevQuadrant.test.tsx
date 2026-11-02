import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderShape } from "@full-chaos/ask-dev/render";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuadrantResponse } from "@/lib/types";

import { askDevShapeChart } from "../askDevShapeCharts";

type ChartProps = {
    readonly data: QuadrantResponse;
    readonly scopeType?: string;
    readonly animation?: boolean;
    readonly verbatimEntityLabels?: boolean;
    readonly showClickHint?: boolean;
    readonly showZoneOverlay?: boolean;
    readonly focusEntityIds?: string[];
    readonly onPointSelectAction?: unknown;
    readonly zoneOverlay?: unknown;
};

const chart = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: (props: unknown) => {
        chart.props = props;
        return <div data-testid="quadrant" />;
    },
}));

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/a11y/usePrefersReducedMotion", () => ({
    usePrefersReducedMotion: () => motion.reduced,
}));

afterEach(() => {
    cleanup();
    motion.reduced = false;
});

/**
 * A verified quadrant: ask-dev's fixture, through acr's real quadrant selector (flag on), served
 * line, vocabulary labels, `Validate` and encoder (CHAOS-12624).
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/landscape-quadrant.json",
        ),
        "utf8",
    ),
) as { render_shapes: RenderShape[] };
const quadrant = answer.render_shapes.find((shape) => shape.kind === "quadrant")!;
const [x, y] = [quadrant.series[0]!, quadrant.series[1]!];

async function drawn(shape: RenderShape = quadrant): Promise<ChartProps> {
    render(askDevShapeChart(shape) as ReactElement);
    await screen.findByTestId("quadrant");
    return chart.props as ChartProps;
}

function changed(change: (shape: RenderShape) => void): RenderShape {
    const shape = structuredClone(quadrant);
    change(shape);
    return shape;
}

describe("the host's quadrant for a verified shape (CHAOS-12625)", () => {
    it("the fixture is the case: teams placed on churn (x) and delivery units (y)", () => {
        expect(quadrant.selected_by).toBe("landscape_position");
        expect([x.key, y.key]).toEqual(["churn_loc_30d", "delivery_units_30d"]);
        expect(x.points.length).toBeGreaterThanOrEqual(2);
    });

    it("takes the axes from the series keys and served words, with no unit of its own", async () => {
        const { data } = await drawn();
        expect(data.axes).toEqual({
            x: { metric: x.key, label: x.label, unit: "" },
            y: { metric: y.key, label: y.label, unit: "" },
        });
        expect(data.annotations).toEqual([]);
    });

    it("places one point per team, by its served word, with the shape's own values", async () => {
        const { data } = await drawn();
        expect(data.points.map((point) => [point.entity_label, point.x, point.y])).toEqual(
            x.points.map((point, index) => [point.label, point.value, y.points[index]!.value]),
        );
        expect(data.points.map((point) => point.entity_id)).toEqual(
            x.points.map((point) => point.source.claim_id),
        );
    });

    it("draws raw values only, as team points: no zones, no focus, no click action", async () => {
        const props = await drawn();
        expect(props.scopeType).toBe("team");
        expect(props.showZoneOverlay ?? false).toBe(false);
        expect(props.zoneOverlay).toBeUndefined();
        expect(props.focusEntityIds).toBeUndefined();
        expect(props.onPointSelectAction).toBeUndefined();
        expect(props.showClickHint).toBe(false);
    });

    it("keeps the served words as given: no entity-label rewrite", async () => {
        expect((await drawn()).verbatimEntityLabels).toBe(true);
    });

    it("animates by default, and not under reduced motion", async () => {
        expect((await drawn()).animation).toBe(true);
        cleanup();
        motion.reduced = true;
        expect((await drawn()).animation).toBe(false);
    });
});

describe("the adapter returns null when it cannot draw a quadrant (CHAOS-12538)", () => {
    it.each<[string, RenderShape]>([
        ["a value unit", changed((shape) => void (shape.value_unit = "ratio"))],
        ["one series", changed((shape) => void (shape.series = [shape.series[0]!] as never))],
        [
            "a third series",
            changed((shape) => void (shape.series = [...shape.series, shape.series[1]!] as never)),
        ],
        [
            "one point",
            changed((shape) => {
                for (const series of shape.series) series.points = series.points.slice(0, 1);
            }),
        ],
        ["a length mismatch", changed((shape) => void shape.series[1]!.points.pop())],
        [
            "a label mismatch",
            changed((shape) => void (shape.series[1]!.points[0]!.label = "Someone else")),
        ],
        [
            "a value that is not finite",
            changed((shape) => void (shape.series[0]!.points[0]!.value = Number.NaN)),
        ],
    ])("%s", (_, shape) => {
        expect(askDevShapeChart(shape)).toBeNull();
    });
});

describe("the quadrant loads on demand (CHAOS-12625)", () => {
    it("loads the quadrant module only when a quadrant draws", async () => {
        // A fresh module graph: the renders above already loaded the chart, so a count taken after
        // them could not tell a static import from a lazy one.
        // vi.resetModules keeps a hoisted mock's module, so the count comes from a fresh doMock.
        vi.resetModules();
        let loads = 0;
        vi.doMock("@/components/charts/QuadrantChart", () => {
            loads += 1;
            return { QuadrantChart: () => <div data-testid="quadrant-fresh" /> };
        });
        const fresh = await import("../askDevShapeCharts");
        expect(fresh.askDevShapeChart(changed((shape) => void (shape.kind = "series")))).toBeNull();
        expect(loads).toBe(0);
        render(fresh.askDevShapeChart(quadrant) as ReactElement);
        await screen.findByTestId("quadrant-fresh");
        expect(loads).toBe(1);
    });
});
