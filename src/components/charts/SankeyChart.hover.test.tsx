// Pins hover today: ECharts adjacency emphasis (hovered entity strong, the rest dimmed).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { SankeyChart } from "./SankeyChart";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => [],
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

describe("SankeyChart hover today", () => {
    beforeEach(() => chartSpy.mockClear());

    it("uses adjacency emphasis and routes the tooltip through the caller's formatter", () => {
        const formatter = vi.fn(() => "tip");
        render(
            <SankeyChart
                nodes={[{ name: "A" }, { name: "B" }]}
                links={[{ source: "A", target: "B", value: 1 }]}
                tooltipFormatterAction={formatter}
            />,
        );
        const option = (
            chartSpy.mock.calls[0][0] as {
                option: {
                    series: Array<{ emphasis: { focus: string } }>;
                    tooltip: { formatter: (p: unknown) => string };
                };
            }
        ).option;
        expect(option.series[0].emphasis.focus).toBe("adjacency");
        expect(option.tooltip.formatter({ dataType: "node", data: { name: "A", value: 1 } })).toBe(
            "tip",
        );
        expect(formatter).toHaveBeenCalled();
    });
});
