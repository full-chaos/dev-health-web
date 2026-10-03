import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { TeamCategorySankeySection } from "./TeamCategorySankeySection";
import type { SankeyResponse } from "@/lib/types";

vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div data-testid="mock-sankey-chart" />,
}));

const linkedFlow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Alpha", group: "team" },
        { name: "Feature Delivery", group: "category" },
        { name: "repo-a", group: "repo" },
    ],
    links: [
        { source: "Alpha", target: "Feature Delivery", value: 10 },
        { source: "Feature Delivery", target: "repo-a", value: 10 },
    ],
};
const emptyFlow: SankeyResponse = { mode: "investment", nodes: [], links: [] };

const renderSection = (
    flow: SankeyResponse | null,
    over: { selectedCategory?: string | null } = {},
) =>
    render(
        <TeamCategorySankeySection
            filters={{ scope: { level: "org", ids: [] } } as never}
            focusedTeam={null}
            setFocusedTeam={() => {}}
            selectedCategory={over.selectedCategory ?? null}
            setSelectedCategory={() => {}}
            setFocusSubcategory={() => {}}
            showSubcategories={false}
            effortUnit="work units"
            teamCategoryFlow={flow}
            baselineSankeyFlow={null}
            isCategoryFlowLoading={false}
            prepareSankeyFlow={(f) => f}
            buildSankeyTooltipFormatter={() => () => ""}
            resolveSubcategoryIdFromLabel={() => null}
        />,
    );

describe("TeamCategorySankeySection — no summary block above the chart (prototype allocation())", () => {
    it("draws no coverage line, no top-theme chips and no left-rule paragraph: coverage is in the tiles", () => {
        renderSection({ ...linkedFlow, coverage: { team: 0.85, repo: 0.72 } });
        const section = screen.getByTestId("team-category-sankey");
        expect(section).not.toHaveTextContent(/Team coverage|Repo coverage/);
        expect(section).not.toHaveTextContent(/Top themes?:|Top subcategories:/);
        expect(section).not.toHaveTextContent("This view shows where effort appears to land");
        expect(section).not.toHaveTextContent("Team to Theme to Repo");
        expect(section.querySelector(".border-l-2")).toBeNull();
        // The chart and the aside follow at once.
        expect(screen.getByTestId("mock-sankey-chart")).toBeInTheDocument();
        expect(screen.getByTestId("selected-path-panel")).toBeInTheDocument();
    });

    it("a theme drill chip names the theme by its label, never the raw key", () => {
        renderSection(
            {
                ...linkedFlow,
                nodes: [
                    { name: "Alpha", group: "team" },
                    { name: "feature_delivery", group: "category" },
                    { name: "repo-a", group: "repo" },
                ],
                links: [
                    { source: "Alpha", target: "feature_delivery", value: 10 },
                    { source: "feature_delivery", target: "repo-a", value: 10 },
                ],
            },
            { selectedCategory: "feature_delivery" },
        );
        const chips = screen.getByTestId("allocation-drill-chips");
        expect(chips).toHaveTextContent("Drilldown: Theme = Feature Delivery");
        expect(chips).not.toHaveTextContent("feature_delivery");
    });
});

describe("TeamCategorySankeySection — empty state", () => {
    it("keeps 'No allocation path' for an empty flow whose coverage was produced", () => {
        renderSection({ ...emptyFlow, coverage: { team: 0, repo: 0 } });
        expect(screen.getByText(/No allocation path available/)).toBeInTheDocument();
    });

    it("does not claim 'no allocation path' when the coverage read is unavailable", () => {
        renderSection(emptyFlow);
        expect(screen.queryByText(/No allocation path/)).not.toBeInTheDocument();
        expect(
            screen.getByText(/Coverage could not be computed for this window/),
        ).toBeInTheDocument();
    });

    it("does not claim 'no allocation path' when only one coverage leaf is unavailable", () => {
        renderSection({ ...emptyFlow, coverage: { team: 0.5 } });
        expect(screen.queryByText(/No allocation path/)).not.toBeInTheDocument();
        expect(
            screen.getByText(/Coverage could not be computed for this window/),
        ).toBeInTheDocument();
    });

    it("does not claim 'no allocation path' when no flow resolved (error)", () => {
        renderSection(null);
        expect(screen.queryByText(/No allocation path/)).not.toBeInTheDocument();
        expect(
            screen.getByText(/Coverage could not be computed for this window/),
        ).toBeInTheDocument();
    });
});
