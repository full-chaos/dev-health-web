import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

import { HeatmapPanel } from "./HeatmapPanel";

vi.mock("./HeatmapChart", () => ({
    HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));

// CHAOS-9133: a heatmap answer with no axes (or no legend) is the empty state, never a crash.
const request = {
    type: "risk" as const,
    metric: "hotspot_risk",
    scope_type: "org",
    range_days: 30,
};
const cell = { x: "Mon", y: "auth", value: 5 };

const draw = (initialData: unknown) =>
    render(
        <HeatmapPanel
            title="T"
            description="d"
            request={request}
            initialData={initialData as never}
            emptyState="Heatmap data unavailable."
        />,
    );

describe("HeatmapPanel with a partial answer", () => {
    it.each([
        ["no axes, no legend", { cells: [] }],
        ["axes null", { axes: null, cells: [cell], legend: { unit: "risk", scale: "linear" } }],
        ["axes present, legend missing", { axes: { x: ["Mon"], y: ["auth"] }, cells: [cell] }],
        [
            "axes present, legend null",
            { axes: { x: ["Mon"], y: ["auth"] }, cells: [cell], legend: null },
        ],
    ])("%s draws the existing empty state", (_name, data) => {
        const { container } = draw(data);
        expect(container).toHaveTextContent("Heatmap data unavailable.");
        expect(screen.queryByTestId("heatmap-chart")).toBeNull();
    });

    it("a full answer still draws the chart", () => {
        draw({
            axes: { x: ["Mon"], y: ["auth"] },
            cells: [cell],
            legend: { unit: "risk", scale: "linear" },
            evidence: [],
        });
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    });
});
