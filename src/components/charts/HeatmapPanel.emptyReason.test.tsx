import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { filterEmptyReasonText } from "@/lib/metrics/filterEmptyReason";

import { HeatmapPanel } from "./HeatmapPanel";

vi.mock("./HeatmapChart", () => ({
    HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));

// CHAOS-9210: the served answer for a team plus a repository the team does not hold has axes and a
// legend but 0 cells. The reason text is the empty state, not an empty grid.
const request = {
    type: "temporal_load" as const,
    metric: "commit_count",
    scope_type: "team",
    range_days: 30,
};
const hours = Array.from({ length: 24 }, (_, i) => String(i));
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const prodShape = (reason: string | null) => ({
    axes: { x: hours, y: days },
    cells: [],
    legend: { unit: "commits", scale: "linear", filter_empty_reason: reason },
    repo_filter_applied: true,
    filter_empty_reason: reason,
    evidence: [],
});

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

describe("HeatmapPanel with a served filter-empty reason and axes", () => {
    it.each(["repository_not_in_team", "repository_not_found"])(
        "%s draws the reason text, not an empty grid",
        (reason) => {
            const { container } = draw(prodShape(reason));
            expect(container).toHaveTextContent(filterEmptyReasonText(reason) as string);
            expect(screen.queryByTestId("heatmap-chart")).toBeNull();
        },
    );

    it("a null reason with axes and 0 cells keeps the present behaviour", () => {
        draw(prodShape(null));
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    });

    it("an unknown reason keeps the present behaviour", () => {
        draw(prodShape("something_new"));
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    });
});
