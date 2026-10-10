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

    // CHAOS-9097: the served flag decides; the repository-in-filter rule holds only with the keys absent.
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
        draw({ repos: ["r1"] }, { ...data, ...keys });
        expect(screen.queryByTestId("repo-scope-note") !== null).toBe(note);
    });

    it("shows the note for a served false even with no repository in the filter", () => {
        draw({}, { ...data, repo_filter_applied: false });
        expect(screen.getByTestId("repo-scope-note")).toBeInTheDocument();
    });

    it.each([
        ["repository_not_in_team", "The selected repository is not owned by the selected team."],
        ["repository_not_found", "The selected repository was not found."],
    ])("the empty state says why: %s", (reason, text) => {
        draw(
            { repos: ["r1"] },
            { ...data, points: [], repo_filter_applied: true, filter_empty_reason: reason },
        );
        expect(screen.getByTestId("quadrant-empty")).toHaveTextContent(text);
        expect(screen.queryByTestId("repo-scope-note")).toBeNull();
    });

    it("an empty answer with no reason keeps the page empty text", () => {
        draw(
            { repos: ["r1"] },
            { ...data, points: [], repo_filter_applied: true, filter_empty_reason: null },
        );
        expect(screen.getByTestId("quadrant-empty")).toHaveTextContent(
            "Quadrant data unavailable.",
        );
    });
});
