import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { InvestmentMixSunburst, ringOneLabelWidth } from "./InvestmentMixSunburst";

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
    investmentThemeColor: (_key: string, _tokens: unknown, fallback: string) => fallback,
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="sunburst-chart" />;
    },
}));

type ThemeLabel = {
    show?: boolean;
    width?: number;
    overflow?: string;
    rotate?: string;
    color?: string;
    textBorderWidth?: number;
};

function themeLabels(): Record<string, ThemeLabel> {
    const props = chartSpy.mock.calls.at(-1)?.[0] as {
        option: { series: Array<{ data: Array<{ name: string; label: ThemeLabel }> }> };
    };
    return Object.fromEntries(props.option.series[0].data.map((d) => [d.name, d.label]));
}

describe("InvestmentMixSunburst ring-1 labels (CHAOS-8510)", () => {
    beforeEach(() => chartSpy.mockClear());

    it("cuts a label to its own arc and hides it when the arc is too short", () => {
        render(
            <InvestmentMixSunburst
                themeDistribution={{ feature_delivery: 60, operational: 38, risk: 2 }}
                subcategoryDistribution={{}}
                height={360}
            />,
        );
        const labels = themeLabels();
        // half side 180px, ring-1 mid radius 0.31 * 180 = 55.8px, arc = 2 * pi * 55.8 * share - 10
        expect(labels["Feature Delivery"].width).toBe(ringOneLabelWidth(180, 0.6));
        expect(labels["Feature Delivery"].overflow).toBe("truncate");
        expect(labels["Feature Delivery"].rotate).toBe("tangential");
        expect(labels["Feature Delivery"].show).not.toBe(false);
        expect(labels["Risk"].show).toBe(false);
    });

    it("never adds a text border or shadow to a label", () => {
        render(
            <InvestmentMixSunburst
                themeDistribution={{ feature_delivery: 50, maintenance: 50 }}
                subcategoryDistribution={{}}
            />,
        );
        for (const label of Object.values(themeLabels())) {
            expect(label.textBorderWidth).toBe(0);
        }
    });

    it("ringOneLabelWidth: share of the arc minus a margin, never negative", () => {
        expect(ringOneLabelWidth(180, 1)).toBe(Math.floor(2 * Math.PI * 0.31 * 180 - 10));
        expect(ringOneLabelWidth(180, 0)).toBe(0);
    });
});
