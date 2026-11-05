import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { ringLabelWidth } from "./sunburstRingLabels";
import { SunburstChart, type SunburstNode } from "./SunburstChart";

const chartTheme = {
    text: "#111827",
    grid: "#e5e7eb",
    muted: "#6b7280",
    background: "#161c20",
    stroke: "#d1d5db",
    accent1: "#2563eb",
    accent2: "#7c3aed",
    accent3: "#ef4444",
};

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => ["#e8650a", "#02a2bc", "#c98500", "#da2100", "#0b8fb0"],
    useChartTokens: () => ({}),
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="sunburst-chart" />;
    },
}));

type Label = { show?: boolean; width?: number; overflow?: string };
type Labelled = { name: string; label: Label; children?: Labelled[] };

function drawn(): Labelled[] {
    const props = chartSpy.mock.calls.at(-1)?.[0] as {
        option: { series: Array<{ data: Labelled[] }> };
    };
    return props.option.series[0].data;
}

// CHAOS-12912: small subcategory arcs side by side under a larger theme.
const data: SunburstNode = {
    name: "root",
    value: 100,
    children: [
        {
            name: "Feature Delivery",
            value: 60,
            children: [
                { name: "Roadmap", value: 50 },
                { name: "Refactor", value: 6 },
                { name: "Upgrade", value: 4 },
            ],
        },
        { name: "Maintenance", value: 40, children: [{ name: "Cleanup", value: 40 }] },
    ],
};

describe("SunburstChart second-ring labels (CHAOS-12912)", () => {
    beforeEach(() => chartSpy.mockClear());

    it("cuts a subcategory label to its own arc and hides it when the arc is too short", () => {
        render(<SunburstChart data={data} height={360} />);
        const subs = Object.fromEntries(
            drawn().flatMap((theme) => (theme.children ?? []).map((c) => [c.name, c.label])),
        );
        expect(subs["Roadmap"].width).toBe(ringLabelWidth(180, 0.5, 0.4, 0.65));
        expect(subs["Roadmap"].overflow).toBe("truncate");
        expect(subs["Roadmap"].show).not.toBe(false);
        expect(subs["Refactor"].show).toBe(false);
        expect(subs["Upgrade"].show).toBe(false);
    });
});
