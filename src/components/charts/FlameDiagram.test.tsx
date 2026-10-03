import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { FlameDiagram } from "./FlameDiagram";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#656c73",
    background: "#161c20",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

const fallbackTokens = {
    themeOperational: "#0b8fb0",
    themeQuality: "#02a2bc",
    caution: "#f2b84b",
    negative: "#ff8266",
};

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => ["#000001", "#000002"],
    useChartTokens: () => fallbackTokens,
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

type Item = {
    shape: { x: number; width: number; r: number };
    style: Record<string, unknown>;
    textContent: { style: { fill: string; stroke?: string; lineWidth: number } };
};

const frame = (state: string, category = "planned") => ({
    id: state + category,
    parent_id: null,
    label: state,
    start: "2026-01-01T00:00:00Z",
    end: "2026-01-02T00:00:00Z",
    state: state as "active",
    category: category as "planned",
});

function render1(state: string, category?: string): Item {
    chartSpy.mockClear();
    render(
        <FlameDiagram
            frames={[frame(state, category)]}
            start="2026-01-01T00:00:00Z"
            end="2026-01-02T00:00:00Z"
        />,
    );
    const opt = (
        chartSpy.mock.calls[0][0] as {
            option: {
                series: Array<{
                    renderItem: (params: unknown, api: unknown) => unknown;
                    data: unknown[][];
                }>;
            };
        }
    ).option;
    const s = opt.series[0];
    const vals = s.data[0];
    const api = {
        value: (i: number) => vals[i],
        coord: ([x, y]: [string, number]) => [x === vals[0] ? 100 : 300, 50 + y],
        size: () => [10, 20],
    };
    return s.renderItem({}, api) as Item;
}

describe("FlameDiagram", () => {
    beforeEach(() => chartSpy.mockClear());

    it("maps the five states to named token roles", () => {
        expect(render1("active").style.fill).toBe(fallbackTokens.themeOperational);
        expect(render1("ci").style.fill).toBe(fallbackTokens.themeQuality);
        expect(render1("waiting").style.fill).toBe(fallbackTokens.caution);
        expect(render1("blocked").style.fill).toBe(fallbackTokens.negative);
        expect(render1("active", "rework").style.fill).toBe(chartTheme.muted);
    });

    it("uses no outline: 1px inset each side and radius 3", () => {
        const item = render1("active");
        expect(item.style).not.toHaveProperty("stroke");
        expect(item.shape).toMatchObject({ x: 101, width: 198, r: 3 });
    });

    it("label ink is white or near-black and is never dropped", () => {
        for (const s of ["active", "ci", "waiting", "blocked"]) {
            const ink = render1(s).textContent.style;
            expect(["#ffffff", "#050505"]).toContain(ink.fill);
            expect(ink.stroke).toBeUndefined();
            expect(ink.lineWidth).toBeUndefined();
        }
    });
});
