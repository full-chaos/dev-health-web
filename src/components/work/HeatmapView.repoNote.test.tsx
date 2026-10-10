import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

import { HeatmapView } from "./HeatmapView";

vi.mock("@/components/charts/HeatmapChart", () => ({
    HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));

// CHAOS-9160: the page filter reaches the heatmap panel, which says the repository is not applied.
const filters = (repos: string[]) => ({
    scope: { level: "team" as const, ids: ["t1"] },
    time: { period: "30d" as const, range_days: 30, compare_days: 30 },
    who: {},
    what: { repos },
    why: {},
    how: {},
});
const heatmap = {
    axes: { x: ["Mon"], y: ["9"] },
    cells: [{ x: "Mon", y: "9", value: 5 }],
    legend: { unit: "h", scale: "linear" },
    evidence: [],
};

describe("HeatmapView repository note", () => {
    it("shows the note with a repository selected", () => {
        render(
            <HeatmapView filters={filters(["r1"])} scopeId="t1" reviewHeatmap={heatmap as never} />,
        );
        expect(screen.getByTestId("repo-scope-note")).toBeInTheDocument();
    });
    it("shows no note without one", () => {
        render(<HeatmapView filters={filters([])} scopeId="t1" reviewHeatmap={heatmap as never} />);
        expect(screen.queryByTestId("repo-scope-note")).toBeNull();
    });
});
