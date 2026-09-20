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

const renderSection = (flow: SankeyResponse | null) =>
    render(
        <TeamCategorySankeySection
            filters={{ scope: { level: "org", ids: [] } } as never}
            focusedTeam={null}
            setFocusedTeam={() => {}}
            selectedCategory={null}
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

const header = () => screen.getByText(/Team coverage:/).closest("div")!;

describe("TeamCategorySankeySection — coverage header and empty state", () => {
    it("shows produced coverage as percentages", () => {
        renderSection({ ...linkedFlow, coverage: { team: 0.85, repo: 0.72 } });
        expect(header()).toHaveTextContent("Team coverage: 85%");
        expect(header()).toHaveTextContent("Repo coverage: 72%");
    });

    it("shows a produced 0 as 0%", () => {
        renderSection({ ...linkedFlow, coverage: { team: 0, repo: 0 } });
        expect(header()).toHaveTextContent("Team coverage: 0%");
        expect(header()).toHaveTextContent("Repo coverage: 0%");
    });

    it("shows unavailable, not 0%, when coverage is null", () => {
        renderSection({ ...linkedFlow, coverage: null as unknown as SankeyResponse["coverage"] });
        expect(header()).toHaveTextContent("Team coverage: unavailable");
        expect(header()).toHaveTextContent("Repo coverage: unavailable");
        expect(header()).not.toHaveTextContent("0%");
    });

    it("shows unavailable, not 0%, when coverage is absent", () => {
        renderSection(linkedFlow);
        expect(header()).toHaveTextContent("Team coverage: unavailable");
        expect(header()).not.toHaveTextContent("0%");
    });

    it("shows unavailable for a non-finite leaf and a number for the other", () => {
        renderSection({ ...linkedFlow, coverage: { team: Number.NaN, repo: 0.5 } });
        expect(header()).toHaveTextContent("Team coverage: unavailable");
        expect(header()).toHaveTextContent("Repo coverage: 50%");
        expect(header()).not.toHaveTextContent("NaN");
    });

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
