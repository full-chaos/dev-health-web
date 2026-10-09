import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { TeamCategorySankeySection } from "./TeamCategorySankeySection";
import type { SankeyResponse } from "@/lib/types";

const { sankeySpy } = vi.hoisted(() => ({ sankeySpy: vi.fn() }));

vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: (props: unknown) => {
        sankeySpy(props);
        return <div data-testid="mock-sankey-chart" />;
    },
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
    over: {
        selectedCategory?: string | null;
        categoryFlowFailed?: boolean;
        baselineFlow?: SankeyResponse | null;
    } = {},
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
            baselineSankeyFlow={over.baselineFlow ?? null}
            isCategoryFlowLoading={false}
            categoryFlowFailed={over.categoryFlowFailed}
            prepareSankeyFlow={(f) => f}
            buildSankeyTooltipFormatter={() => () => ""}
            resolveSubcategoryIdFromLabel={() => null}
        />,
    );

describe("TeamCategorySankeySection — node labels (CHAOS-8565)", () => {
    it("asks the chart for node values and draws a theme key as its title-case name", () => {
        sankeySpy.mockClear();
        renderSection(linkedFlow);
        const props = sankeySpy.mock.calls.at(-1)?.[0] as {
            showNodeValues?: boolean;
            nodeLabelAction?: (label: string, group: string | undefined) => string;
        };
        expect(props.showNodeValues).toBe(true);
        expect(props.nodeLabelAction?.("feature_delivery", "category")).toBe("Feature Delivery");
        // The same short names as the Investment tables and the treemap.
        expect(props.nodeLabelAction?.("quality", "category")).toBe("Quality");
        expect(props.nodeLabelAction?.("operational", "category")).toBe("Operational");
        expect(props.nodeLabelAction?.("some_new_theme", "category")).toBe("Some New Theme");
        // Only themes are rewritten: a repo or team name is drawn as served.
        expect(props.nodeLabelAction?.("dev_health_ops", "repo")).toBe("dev_health_ops");
        expect(props.nodeLabelAction?.("feature_delivery", undefined)).toBe("feature_delivery");
    });
});

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

    // CHAOS-8584: the chip uses the one short label source of the page (the node, the tabs,
    // the tables), not the long names of THEME_LABELS.
    it("a theme drill chip uses the short label the node shows: 'Quality', not 'Quality / Reliability'", () => {
        renderSection(
            {
                ...linkedFlow,
                nodes: [
                    { name: "Alpha", group: "team" },
                    { name: "quality", group: "category" },
                    { name: "repo-a", group: "repo" },
                ],
                links: [
                    { source: "Alpha", target: "quality", value: 10 },
                    { source: "quality", target: "repo-a", value: 10 },
                ],
            },
            { selectedCategory: "quality" },
        );
        const chips = screen.getByTestId("allocation-drill-chips");
        expect(chips).toHaveTextContent(/^Drilldown: Theme = Quality\s*x$/u);
        expect(chips).not.toHaveTextContent("Reliability");
        expect(screen.getByTestId("selected-path-title")).toHaveTextContent(/^Quality$/u);
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

describe("TeamCategorySankeySection — a failed read is not a flow and not null coverage", () => {
    const FAILED_TITLE = "Team-to-category allocation unavailable";
    const FAILED_TEXT = "The team-to-category flow could not be loaded for this scope and window.";

    it("data: draws the chart and no failure state", () => {
        renderSection({ ...linkedFlow, coverage: { team: 0.85, repo: 0.72 } });
        expect(screen.getByTestId("mock-sankey-chart")).toBeInTheDocument();
        expect(screen.queryByText(FAILED_TITLE)).not.toBeInTheDocument();
    });

    it("data + error: draws the failure state and no chart beside it", () => {
        renderSection(
            { ...linkedFlow, coverage: { team: 0.85, repo: 0.72 } },
            {
                categoryFlowFailed: true,
            },
        );
        expect(screen.getByText(FAILED_TITLE)).toBeInTheDocument();
        expect(screen.getByText(FAILED_TEXT)).toBeInTheDocument();
        expect(screen.queryByTestId("mock-sankey-chart")).not.toBeInTheDocument();
    });

    it("error only: draws the failure state, not the null-coverage text or 'no allocation path'", () => {
        renderSection(null, { categoryFlowFailed: true });
        expect(screen.getByText(FAILED_TITLE)).toBeInTheDocument();
        expect(screen.queryByText(/No allocation path/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Coverage could not be computed/)).not.toBeInTheDocument();
    });

    it("null coverage without an error keeps the existing unavailable text", () => {
        renderSection(emptyFlow);
        expect(screen.queryByText(FAILED_TITLE)).not.toBeInTheDocument();
        expect(
            screen.getByText(/Coverage could not be computed for this window/),
        ).toBeInTheDocument();
    });

    it("a missing baseline (failed comparison) does not blank a current flow that loaded", () => {
        renderSection(
            { ...linkedFlow, coverage: { team: 0.85, repo: 0.72 } },
            {
                baselineFlow: null,
            },
        );
        expect(screen.getByTestId("mock-sankey-chart")).toBeInTheDocument();
        expect(screen.queryByText(FAILED_TITLE)).not.toBeInTheDocument();
    });
});
