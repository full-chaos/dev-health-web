import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

import { HeatmapPanel } from "./HeatmapPanel";

vi.mock("./HeatmapChart", () => ({
    HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));

// CHAOS-9160: the heatmap route takes no repository beside a team, so a selected repository says so.
const request = {
    type: "risk" as const,
    metric: "hotspot_risk",
    scope_type: "team",
    scope_id: "t1",
    range_days: 30,
};
const data = {
    axes: { x: ["Mon"], y: ["auth"] },
    cells: [{ x: "Mon", y: "auth", value: 5 }],
    legend: { unit: "risk", scale: "linear" },
    evidence: [],
};
const baseFilters = {
    scope: { level: "team" as const, ids: ["t1"] },
    time: { period: "30d" as const, range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const draw = (what: { repos?: string[] } | null, embedded = false) =>
    render(
        <HeatmapPanel
            title="T"
            description="d"
            request={request}
            initialData={data as never}
            embedded={embedded}
            filters={what ? { ...baseFilters, what } : undefined}
        />,
    );

describe("HeatmapPanel repository note", () => {
    it.each([
        ["own card", false],
        ["embedded in a Section", true],
    ])("says Not filtered by repository while a repository is selected (%s)", (_n, embedded) => {
        draw({ repos: ["r1"] }, embedded);
        expect(screen.getByTestId("repo-scope-note")).toHaveTextContent(
            "Not filtered by repository",
        );
    });

    it.each([
        ["no repos key", {}],
        ["empty repos", { repos: [] }],
        ["no filters passed", null],
    ])("has no note with %s", (_n, what) => {
        draw(what);
        expect(screen.queryByTestId("repo-scope-note")).toBeNull();
    });
});
