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

    // CHAOS-9097: the served flag decides; the repository-in-filter rule holds only with the keys absent.
    const drawServed = (keys: object, cells = data.cells, embedded = false) =>
        render(
            <HeatmapPanel
                title="T"
                description="d"
                request={request}
                initialData={{ ...data, cells, ...keys } as never}
                embedded={embedded}
                filters={{ ...baseFilters, what: { repos: ["r1"] } }}
            />,
        );

    it.each([
        ["true (narrowed)", { repo_filter_applied: true, filter_empty_reason: null }, false],
        [
            "null (nothing selected)",
            { repo_filter_applied: null, filter_empty_reason: null },
            false,
        ],
        ["false (cannot narrow)", { repo_filter_applied: false, filter_empty_reason: null }, true],
        ["keys absent (older ops)", {}, true],
    ])("with a repository selected and the flag %s", (_n, keys, note) => {
        drawServed(keys);
        expect(screen.queryByTestId("repo-scope-note") !== null).toBe(note);
    });

    it("shows the note for a served false when embedded", () => {
        drawServed({ repo_filter_applied: false }, data.cells, true);
        expect(screen.getByTestId("repo-scope-note")).toBeInTheDocument();
    });

    it.each([
        ["repository_not_in_team", "The selected repository is not owned by the selected team."],
        ["repository_not_found", "The selected repository was not found."],
    ])("the empty state says why: %s", (reason, text) => {
        render(
            <HeatmapPanel
                title="T"
                description="d"
                request={request}
                initialData={
                    {
                        axes: { x: [], y: [] },
                        cells: [],
                        legend: { unit: "risk", scale: "linear" },
                        repo_filter_applied: true,
                        filter_empty_reason: reason,
                    } as never
                }
                emptyState="Heatmap data unavailable."
                filters={{ ...baseFilters, what: { repos: ["r1"] } }}
            />,
        );
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(screen.queryByText("Heatmap data unavailable.")).toBeNull();
    });
});
