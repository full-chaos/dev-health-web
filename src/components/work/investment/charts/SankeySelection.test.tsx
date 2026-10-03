// The allocation switch + selection: one Sankey at a time; selecting an entity filters the chart
// to it (chip with X, panel numbers); the production drills and focus calls keep working.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test/utils";

import type { SankeyResponse } from "@/lib/types";
import { AllocationSankeySwitch } from "./AllocationSankeySwitch";

type ChartProps = {
    nodes: Array<{ name: string; group?: string }>;
    links: Array<{ source: string; target: string; value: number }>;
    onItemClickAction: (item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
    }) => void;
};
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="mock-sankey-chart" />;
    },
}));
const chart = () => chartSpy.mock.calls.at(-1)![0] as ChartProps;
const click = (item: Parameters<ChartProps["onItemClickAction"]>[0]) => {
    act(() => chart().onItemClickAction(item));
};

const teamFlow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Alpha", group: "team" },
        { name: "Beta", group: "team" },
        { name: "Risk", group: "category" },
        { name: "Quality", group: "category" },
        { name: "acme/repo-a", group: "repo" },
        { name: "acme/repo-b", group: "repo" },
    ],
    links: [
        { source: "Alpha", target: "Risk", value: 6 },
        { source: "Beta", target: "Quality", value: 4 },
        { source: "Risk", target: "acme/repo-a", value: 6 },
        { source: "Quality", target: "acme/repo-b", value: 4 },
    ],
    coverage: { team: 1, repo: 1 },
};
const baseline: SankeyResponse = {
    ...teamFlow,
    links: [
        { source: "Alpha", target: "Risk", value: 5 },
        { source: "Beta", target: "Quality", value: 15 },
        { source: "Risk", target: "acme/repo-a", value: 5 },
        { source: "Quality", target: "acme/repo-b", value: 15 },
    ],
};
const destFlow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Bugfix", group: "subcategory" },
        { name: "Debt", group: "subcategory" },
        { name: "acme/repo-a", group: "repo" },
        { name: "acme/repo-b", group: "repo" },
        { name: "Platform", group: "team" },
    ],
    links: [
        { source: "Bugfix", target: "acme/repo-a", value: 3 },
        { source: "Debt", target: "acme/repo-b", value: 1 },
        { source: "acme/repo-a", target: "Platform", value: 3 },
        { source: "acme/repo-b", target: "Platform", value: 1 },
    ],
};

const setFocusedTeam = vi.fn();
const setSelectedCategory = vi.fn();
const setFocusSubcategory = vi.fn();

function renderSwitch(
    over: { focusedTeam?: string | null; selectedCategory?: string | null } = {},
) {
    const common = {
        filters: { scope: { level: "org", ids: [] }, time: {} } as never,
        effortUnit: "work units",
        prepareSankeyFlow: (f: SankeyResponse | null) => f,
        buildSankeyTooltipFormatter: () => () => "tip",
        resolveSubcategoryIdFromLabel: (l: string) => (l === "Bugfix" ? "quality.bugfix" : null),
        setFocusSubcategory,
    };
    return render(
        <AllocationSankeySwitch
            teamCategory={{
                ...common,
                focusedTeam: over.focusedTeam ?? null,
                setFocusedTeam,
                selectedCategory: over.selectedCategory ?? null,
                setSelectedCategory,
                showSubcategories: false,
                teamCategoryFlow: teamFlow,
                baselineSankeyFlow: baseline,
                isCategoryFlowLoading: false,
            }}
            repoTeam={{
                ...common,
                repoTeamFlow: destFlow,
                isRepoTeamLoading: false,
                repoTeamFlowFailed: false,
            }}
        />,
    );
}

beforeEach(() => {
    chartSpy.mockClear();
    setFocusedTeam.mockClear();
    setSelectedCategory.mockClear();
    setFocusSubcategory.mockClear();
});

describe("the allocation switch", () => {
    it("draws exactly one Sankey, defaulting to Team -> Theme -> Repo", () => {
        renderSwitch();
        expect(screen.getAllByTestId("mock-sankey-chart")).toHaveLength(1);
        expect(screen.getByTestId("team-category-sankey")).toBeVisible();
        expect(chart().nodes.map((n) => n.name)).toContain("Alpha");
    });

    it("switching draws the other existing dataset, with its own view", () => {
        renderSwitch();
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        expect(screen.getAllByTestId("mock-sankey-chart")).toHaveLength(1);
        expect(screen.getByTestId("repo-team-sankey")).toBeVisible();
        expect(screen.queryByTestId("team-category-sankey")).toBeNull();
        expect(chart().nodes.map((n) => n.name)).toContain("Bugfix");
    });
});

describe("selecting a repo or subcategory filters the chart to that entity", () => {
    it("repo in Team -> Theme -> Repo (found by the shortened name the chart reports): only the repo and the flows touching it, chip + panel", () => {
        renderSwitch();
        click({ type: "node", name: "repo-b" });
        expect(
            chart()
                .nodes.map((n) => n.name)
                .sort(),
        ).toEqual(["Quality", "acme/repo-b"]);
        expect(chart().links).toEqual([{ source: "Quality", target: "acme/repo-b", value: 4 }]);
        expect(screen.getByText(/Selected: Repo = acme\/repo-b/)).toBeInTheDocument();
        expect(screen.getByTestId("selected-path-title")).toHaveTextContent("acme/repo-b");
        expect(screen.getByTestId("selected-path-allocated")).toHaveTextContent("4 work units");
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("40%");
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent("75%");
        expect(screen.getByTestId("selected-path-change")).toHaveTextContent(
            "-35 percentage points",
        );
    });

    it("a second click on the same entity clears it, and so does the chip's X", () => {
        renderSwitch();
        click({ type: "node", name: "repo-b" });
        click({ type: "node", name: "repo-b" });
        expect(screen.queryByText(/Selected: Repo/)).not.toBeInTheDocument();
        expect(chart().nodes).toHaveLength(6);
        click({ type: "node", name: "repo-a" });
        fireEvent.click(screen.getByText(/Selected: Repo = acme\/repo-a/));
        expect(chart().nodes).toHaveLength(6);
        expect(screen.getByTestId("selected-path-empty")).toBeInTheDocument();
    });

    it("the Unassigned repo is not selectable (as the Unassigned team is not)", () => {
        renderSwitch();
        click({ type: "node", name: "Unassigned repo" });
        expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    });

    it("subcategory in the destination view: filters the chart AND still focuses the page", () => {
        renderSwitch();
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        click({ type: "node", name: "Bugfix" });
        expect(setFocusSubcategory).toHaveBeenCalledWith("quality.bugfix");
        expect(
            chart()
                .nodes.map((n) => n.name)
                .sort(),
        ).toEqual(["Bugfix", "acme/repo-a"]);
        expect(screen.getByText(/Selected: Subcategory = Bugfix/)).toBeInTheDocument();
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("75%");
    });

    it("destination view panel has no baseline: says not available, never 0%", () => {
        renderSwitch();
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        click({ type: "node", name: "repo-a" });
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent(
            "not available for this view",
        );
        expect(screen.getByTestId("selected-path-baseline")).not.toHaveTextContent("0%");
    });

    it("chip X on a subcategory also clears the page subcategory focus", () => {
        renderSwitch();
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        click({ type: "node", name: "Bugfix" });
        setFocusSubcategory.mockClear();
        fireEvent.click(screen.getByText(/Selected: Subcategory = Bugfix/));
        expect(setFocusSubcategory).toHaveBeenCalledWith(null);
    });

    it("switching the view clears the selection", () => {
        renderSwitch();
        click({ type: "node", name: "repo-a" });
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /team.*theme.*repo/i }));
        expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    });
});

describe("team and theme keep production's drill; the panel is its side view", () => {
    it("a team drill: panel shows the team's numbers against ALL allocation, not the filtered flow", () => {
        renderSwitch({ focusedTeam: "Alpha" });
        // chart is cut to the team (production)
        expect(
            chart()
                .nodes.map((n) => n.name)
                .sort(),
        ).toEqual(["Alpha", "Risk", "acme/repo-a"]);
        expect(screen.getByTestId("selected-path-title")).toHaveTextContent("Alpha");
        expect(screen.getByTestId("selected-path-allocated")).toHaveTextContent("6 work units");
        // 6 of 10 in the unfiltered flow, baseline 5 of 20
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("60%");
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent("25%");
        expect(screen.getByTestId("selected-path-change")).toHaveTextContent(
            "+35 percentage points",
        );
    });

    it("a theme drill shows its allocated number and no share (the flow holds only that theme)", () => {
        renderSwitch({ selectedCategory: "Risk" });
        expect(screen.getByTestId("selected-path-title")).toHaveTextContent("Risk");
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("not shown");
    });

    it("selecting a team or theme node clears a repo selection (production drills win)", () => {
        renderSwitch();
        click({ type: "node", name: "repo-a" });
        click({ type: "node", name: "Alpha" });
        expect(setFocusedTeam).toHaveBeenCalledWith("Alpha");
        expect(screen.queryByText(/Selected: Repo/)).not.toBeInTheDocument();
    });

    it("with a team drill, a repo selection's share is measured against that team's allocation", () => {
        renderSwitch({ focusedTeam: "Alpha" });
        click({ type: "node", name: "repo-a" });
        expect(screen.getByText("Share of Alpha's allocation")).toBeInTheDocument();
    });
});

describe("the panel's 'Inspect allocation evidence' action keeps the page filters", () => {
    it("opens the Evidence tab with the filter param, in both views", () => {
        renderSwitch();
        click({ type: "node", name: "repo-b" });
        expect(
            screen.getByRole("link", { name: "Inspect allocation evidence" }).getAttribute("href"),
        ).toContain("/investment?tab=evidence&f=");
        fireEvent.click(screen.getByRole("radio", { name: /theme.*repo.*team/i }));
        click({ type: "node", name: "repo-a" });
        expect(
            screen.getByRole("link", { name: "Inspect allocation evidence" }).getAttribute("href"),
        ).toContain("/investment?tab=evidence&f=");
    });
});
