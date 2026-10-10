import { beforeAll, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";

import { QuadrantPanel } from "./QuadrantPanel";

vi.mock("./QuadrantChart", () => ({ QuadrantChart: () => <div data-testid="quadrant-chart" /> }));
vi.mock("./InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
}));

// CHAOS-9160: the quadrant route takes no repository beside a team, so a selected repository says so.
const baseFilters = {
    scope: { level: "team" as const, ids: ["t1"] },
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
const data = {
    axes: { x: { metric: "cycle_time" }, y: { metric: "throughput" } },
    points: [point],
    annotations: [],
};

const draw = (what: { repos?: string[] }, served: unknown = data) =>
    render(
        <QuadrantPanel
            title="Q"
            description="d"
            filters={{ ...baseFilters, what }}
            data={served as never}
        />,
    );

describe("QuadrantPanel repository note", () => {
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

    it("says Not filtered by repository while a repository is selected", () => {
        draw({ repos: ["r1"] });
        expect(screen.getByTestId("repo-scope-note")).toHaveTextContent(
            "Not filtered by repository",
        );
    });

    it("says it on the empty card too", () => {
        draw({ repos: ["r1"] }, { axes: null, points: [] });
        expect(screen.getByTestId("quadrant-empty")).toBeInTheDocument();
        expect(screen.getByTestId("repo-scope-note")).toBeInTheDocument();
    });

    it.each([
        ["no repos key", {}],
        ["empty repos", { repos: [] }],
    ])("has no note with %s", (_n, what) => {
        draw(what);
        expect(screen.queryByTestId("repo-scope-note")).toBeNull();
    });
});
