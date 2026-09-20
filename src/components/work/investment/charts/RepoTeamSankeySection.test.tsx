import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { RepoTeamSankeySection } from "./RepoTeamSankeySection";
import type { SankeyResponse } from "@/lib/types";

vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div data-testid="mock-sankey-chart" />,
}));

const NO_TEAMS = /We currently have no teams associated with work items/;
const UNAVAILABLE = /The repo-to-team flow could not be loaded/;

const withTeams: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Feature Delivery", group: "category" },
        { name: "acme/api", group: "repo" },
        { name: "Platform", group: "team" },
    ],
    links: [
        { source: "Feature Delivery", target: "acme/api", value: 10 },
        { source: "acme/api", target: "Platform", value: 10 },
    ],
};
const producedNoTeams: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Feature Delivery", group: "category" },
        { name: "acme/api", group: "repo" },
    ],
    links: [{ source: "Feature Delivery", target: "acme/api", value: 10 }],
};

const renderSection = (
    flow: SankeyResponse | null | undefined,
    opts: { loading?: boolean; failed?: boolean } = {},
) =>
    render(
        <RepoTeamSankeySection
            filters={{ scope: { level: "org", ids: [] } } as never}
            setFocusSubcategory={() => {}}
            effortUnit="work units"
            repoTeamFlow={flow}
            isRepoTeamLoading={opts.loading ?? false}
            repoTeamFlowFailed={opts.failed ?? false}
            prepareSankeyFlow={(f) => f}
            buildSankeyTooltipFormatter={() => () => ""}
            resolveSubcategoryIdFromLabel={() => null}
        />,
    );

describe("RepoTeamSankeySection — unavailable vs measured absence", () => {
    it("renders the chart when the flow has teams", () => {
        renderSection(withTeams);
        expect(screen.getByTestId("mock-sankey-chart")).toBeInTheDocument();
    });

    it("renders unavailable when the read failed", () => {
        renderSection(null, { failed: true });
        expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
        expect(screen.queryByText(NO_TEAMS)).not.toBeInTheDocument();
    });

    it("renders unavailable when the read failed even if a stale flow is present", () => {
        renderSection(withTeams, { failed: true });
        expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
        expect(screen.queryByTestId("mock-sankey-chart")).not.toBeInTheDocument();
    });

    it("renders unavailable, not 'no teams', when no flow was produced and nothing errored", () => {
        renderSection(null);
        expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
        expect(screen.queryByText(NO_TEAMS)).not.toBeInTheDocument();
    });

    it("renders unavailable for an undefined flow", () => {
        renderSection(undefined);
        expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
        expect(screen.queryByText(NO_TEAMS)).not.toBeInTheDocument();
    });

    it("keeps 'no teams associated' for a produced flow that has no team nodes", () => {
        renderSection(producedNoTeams);
        expect(screen.getByText(NO_TEAMS)).toBeInTheDocument();
        expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    });

    it("keeps 'no teams associated' for a produced empty flow", () => {
        renderSection({ mode: "investment", nodes: [], links: [] });
        expect(screen.getByText(NO_TEAMS)).toBeInTheDocument();
    });

    it("shows loading, not unavailable, while loading", () => {
        renderSection(null, { loading: true });
        expect(screen.getByText(/Loading destination view/)).toBeInTheDocument();
        expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    });
});
