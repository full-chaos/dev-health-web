// Pins what clicking a Sankey does TODAY, in both allocation sections, before the
// switch / selected-path work changes anything. Green on the unchanged code.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import type { SankeyResponse } from "@/lib/types";
import { RepoTeamSankeySection } from "./RepoTeamSankeySection";
import { TeamCategorySankeySection } from "./TeamCategorySankeySection";

type ChartProps = {
    nodes: Array<{ name: string; group?: string }>;
    links: Array<{ source: string; target: string; value: number }>;
    onItemClickAction: (item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
    }) => void;
    tooltipFormatterAction: unknown;
};
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="mock-sankey-chart" />;
    },
}));

const props = () => chartSpy.mock.calls.at(-1)![0] as ChartProps;

const flow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Alpha", group: "team" },
        { name: "Beta", group: "team" },
        { name: "Risk", group: "category" },
        { name: "Quality", group: "category" },
        { name: "repo-a", group: "repo" },
        { name: "repo-b", group: "repo" },
    ],
    links: [
        { source: "Alpha", target: "Risk", value: 6 },
        { source: "Beta", target: "Quality", value: 4 },
        { source: "Risk", target: "repo-a", value: 6 },
        { source: "Quality", target: "repo-b", value: 4 },
    ],
};

const setFocusedTeam = vi.fn();
const setSelectedCategory = vi.fn();
const setFocusSubcategory = vi.fn();

function renderTeamCategory(
    over: Partial<React.ComponentProps<typeof TeamCategorySankeySection>> = {},
) {
    return render(
        <TeamCategorySankeySection
            filters={{ scope: { level: "org", ids: [] } } as never}
            focusedTeam={null}
            setFocusedTeam={setFocusedTeam}
            selectedCategory={null}
            setSelectedCategory={setSelectedCategory}
            setFocusSubcategory={setFocusSubcategory}
            showSubcategories={false}
            effortUnit="work units"
            teamCategoryFlow={flow}
            baselineSankeyFlow={null}
            isCategoryFlowLoading={false}
            prepareSankeyFlow={(f) => f}
            buildSankeyTooltipFormatter={() => () => "tip"}
            resolveSubcategoryIdFromLabel={(label) =>
                label === "Bugfix" ? "quality.bugfix" : null
            }
            {...over}
        />,
    );
}

beforeEach(() => {
    chartSpy.mockClear();
    setFocusedTeam.mockClear();
    setSelectedCategory.mockClear();
    setFocusSubcategory.mockClear();
});

describe("today: Team -> Theme -> Repo clicks", () => {
    it("team node: drills to that team and clears theme + subcategory focus", () => {
        renderTeamCategory();
        props().onItemClickAction({ type: "node", name: "Alpha" });
        expect(setSelectedCategory).toHaveBeenCalledWith(null);
        expect(setFocusSubcategory).toHaveBeenCalledWith(null);
        expect(setFocusedTeam).toHaveBeenCalledWith("Alpha");
    });

    it("the Unassigned team node does nothing", () => {
        const withUnassigned: SankeyResponse = {
            ...flow,
            nodes: [...flow.nodes, { name: "Unassigned team", group: "team" }],
        };
        renderTeamCategory({ teamCategoryFlow: withUnassigned });
        props().onItemClickAction({ type: "node", name: "Unassigned team" });
        expect(setFocusedTeam).not.toHaveBeenCalled();
    });

    it("theme node: toggles the theme drill and clears subcategory focus", () => {
        renderTeamCategory();
        props().onItemClickAction({ type: "node", name: "Risk" });
        expect(setFocusSubcategory).toHaveBeenCalledWith(null);
        const updater = setSelectedCategory.mock.calls[0][0] as (c: string | null) => string | null;
        expect(updater(null)).toBe("Risk");
        expect(updater("Risk")).toBeNull();
    });

    it("repo node does nothing", () => {
        renderTeamCategory();
        props().onItemClickAction({ type: "node", name: "repo-a" });
        expect(setFocusedTeam).not.toHaveBeenCalled();
        expect(setSelectedCategory).not.toHaveBeenCalled();
        expect(setFocusSubcategory).not.toHaveBeenCalled();
    });

    it("subcategory node: focuses the subcategory for the page (the section alone, with no selection handler, does not filter)", () => {
        const withSub: SankeyResponse = {
            ...flow,
            nodes: [...flow.nodes, { name: "Bugfix", group: "subcategory" }],
        };
        renderTeamCategory({ teamCategoryFlow: withSub, selectedCategory: "Quality" });
        const before = props().nodes.length;
        props().onItemClickAction({ type: "node", name: "Bugfix" });
        expect(setFocusSubcategory).toHaveBeenCalledWith("quality.bugfix");
        expect(props().nodes).toHaveLength(before);
    });

    it("link: focuses the source subcategory only while a theme is drilled", () => {
        renderTeamCategory({ selectedCategory: "Quality" });
        props().onItemClickAction({ type: "link", source: "Bugfix", target: "repo-b" });
        expect(setFocusSubcategory).toHaveBeenCalledWith("quality.bugfix");
        setFocusSubcategory.mockClear();
        chartSpy.mockClear();
        renderTeamCategory({ selectedCategory: null });
        props().onItemClickAction({ type: "link", source: "Bugfix", target: "repo-b" });
        expect(setFocusSubcategory).not.toHaveBeenCalled();
    });

    it("a focused team shows only that team's flows, with a chip whose X clears the focus", () => {
        renderTeamCategory({ focusedTeam: "Alpha" });
        expect(
            props()
                .nodes.map((n) => n.name)
                .sort(),
        ).toEqual(["Alpha", "Risk", "repo-a"]);
        expect(props().links).toHaveLength(2);
        expect(screen.getByText(/Drilldown: Team = Alpha/)).toBeInTheDocument();
        fireEvent.click(screen.getByText(/Drilldown: Team = Alpha/));
        expect(setFocusedTeam).toHaveBeenCalledWith(null);
    });

    it("a drilled theme shows its chip; its X clears theme and subcategory focus", () => {
        renderTeamCategory({ selectedCategory: "Risk" });
        fireEvent.click(screen.getByText(/Drilldown: Theme = Risk/));
        expect(setSelectedCategory).toHaveBeenCalledWith(null);
        expect(setFocusSubcategory).toHaveBeenCalledWith(null);
    });

    it("passes the tooltip formatter through to the chart", () => {
        renderTeamCategory();
        expect(typeof props().tooltipFormatterAction).toBe("function");
    });
});

describe("today: Theme -> Repo -> Team clicks", () => {
    const sub: SankeyResponse = {
        mode: "investment",
        nodes: [
            { name: "Bugfix", group: "subcategory" },
            { name: "acme/api", group: "repo" },
            { name: "Platform", group: "team" },
        ],
        links: [
            { source: "Bugfix", target: "acme/api", value: 5 },
            { source: "acme/api", target: "Platform", value: 5 },
        ],
    };
    const renderRepoTeam = () =>
        render(
            <RepoTeamSankeySection
                filters={{ scope: { level: "org", ids: [] } } as never}
                setFocusSubcategory={setFocusSubcategory}
                effortUnit="work units"
                repoTeamFlow={sub}
                isRepoTeamLoading={false}
                repoTeamFlowFailed={false}
                prepareSankeyFlow={(f) => f}
                buildSankeyTooltipFormatter={() => () => "tip"}
                resolveSubcategoryIdFromLabel={(l) => (l === "Bugfix" ? "quality.bugfix" : null)}
            />,
        );

    it("subcategory node focuses the subcategory (the section alone, with no selection handler, does not filter)", () => {
        renderRepoTeam();
        props().onItemClickAction({ type: "node", name: "Bugfix" });
        expect(setFocusSubcategory).toHaveBeenCalledWith("quality.bugfix");
        expect(props().nodes).toHaveLength(3);
    });

    it("any link focuses its source subcategory", () => {
        renderRepoTeam();
        props().onItemClickAction({ type: "link", source: "Bugfix", target: "acme/api" });
        expect(setFocusSubcategory).toHaveBeenCalledWith("quality.bugfix");
    });

    it("repo and team nodes do nothing", () => {
        renderRepoTeam();
        props().onItemClickAction({ type: "node", name: "acme/api" });
        props().onItemClickAction({ type: "node", name: "Platform" });
        expect(setFocusSubcategory).not.toHaveBeenCalled();
    });

    it("passes the tooltip formatter through to the chart", () => {
        renderRepoTeam();
        expect(typeof props().tooltipFormatterAction).toBe("function");
    });
});
