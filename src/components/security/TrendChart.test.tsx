import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const chartOption = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/components/charts/Chart", () => ({
    Chart: ({ option }: { option: unknown }) => {
        chartOption.current = option;
        return <div data-testid="chart" />;
    },
}));
vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return {
        ...actual,
        useChartTheme: () => actual.fallbackTheme,
        useChartTokens: () => actual.fallbackTokens,
    };
});

import { fallbackTokens } from "@/components/charts/chartTheme";

import { TrendChart } from "./TrendChart";

type Series = {
    name: string;
    areaStyle?: unknown;
    lineStyle: { color: string };
};

describe("TrendChart", () => {
    const points = [
        { day: "2026-09-01", opened: 3, fixed: 1 },
        { day: "2026-09-02", opened: 2, fixed: 4 },
    ];

    it("draws Opened and Fixed as two thin lines with no area fill", () => {
        render(<TrendChart points={points} />);

        const { series } = chartOption.current as { series: Series[] };
        expect(series.map((item) => item.name)).toEqual(["Opened", "Fixed"]);
        for (const item of series) {
            expect(item.areaStyle).toBeUndefined();
        }
    });

    it("keeps Opened as the negative token and Fixed as the positive token", () => {
        render(<TrendChart points={points} />);

        const { series } = chartOption.current as { series: Series[] };
        expect(series[0].lineStyle.color).toBe(fallbackTokens.negative);
        expect(series[1].lineStyle.color).toBe(fallbackTokens.positive);
    });
});
