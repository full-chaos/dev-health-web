import { beforeAll, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

import { QuadrantPanel } from "./QuadrantPanel";

vi.mock("./QuadrantChart", () => ({ QuadrantChart: () => <div data-testid="quadrant-chart" /> }));
vi.mock("./InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
}));

// CHAOS-9133: an answer with no axes is an empty panel, never a crash.
const filters = {
    scope: { level: "repo" as const, ids: [] },
    time: { period: "30d" as const, range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
};
const point = {
    entity_id: "team-a",
    entity_label: "Team A",
    x: 4,
    y: 18,
    window_start: "2026-01-01",
    window_end: "2026-01-31",
    evidence_link: "/e",
};

describe("QuadrantPanel with no axes", () => {
    beforeAll(() => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                matches: false,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        });
    });

    it.each([
        ["axes missing", { points: [point], annotations: [] }],
        ["axes null", { axes: null, points: [point], annotations: [] }],
        ["axes without y", { axes: { x: { metric: "cycle_time" } }, points: [point] }],
    ])("%s draws the existing empty state", (_name, data) => {
        render(
            <QuadrantPanel
                title="Q"
                description="d"
                filters={filters}
                data={data as never}
                emptyState="Quadrant data unavailable."
            />,
        );
        expect(screen.getByTestId("quadrant-empty")).toHaveTextContent(
            "Quadrant data unavailable.",
        );
        expect(screen.queryByTestId("quadrant-chart")).toBeNull();
    });

    it("axes present with points still draws the chart", () => {
        render(
            <QuadrantPanel
                title="Q"
                description="d"
                filters={filters}
                data={
                    {
                        axes: {
                            x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
                            y: { metric: "throughput", label: "Throughput", unit: "items" },
                        },
                        points: [point],
                        annotations: [],
                    } as never
                }
            />,
        );
        expect(screen.getByTestId("quadrant-chart")).toBeInTheDocument();
    });
});

// CHAOS-9210: a served filter-empty reason with axes and 0 points draws the reason text.
describe("QuadrantPanel with a served filter-empty reason and axes", () => {
    it.each([
        ["repository_not_in_team", "The selected repository is not owned by the selected team."],
        ["repository_not_found", "The selected repository was not found."],
    ])("%s draws the reason text", (reason, text) => {
        render(
            <QuadrantPanel
                title="Q"
                description="d"
                filters={filters}
                data={
                    {
                        axes: { x: { metric: "cycle_time" }, y: { metric: "throughput" } },
                        points: [],
                        annotations: [],
                        repo_filter_applied: true,
                        filter_empty_reason: reason,
                    } as never
                }
                emptyState="Quadrant data unavailable."
            />,
        );
        expect(screen.getByTestId("quadrant-empty")).toHaveTextContent(text);
    });
});
