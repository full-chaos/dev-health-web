import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIAttributionOverview } = vi.hoisted(() => ({
    mockUseAIAttributionOverview: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributionOverview: mockUseAIAttributionOverview,
}));

import { AIAttributionDashboard } from "../AIAttributionDashboard";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

function overview(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        orgId: "org",
        startDate: filter.startDate,
        endDate: filter.endDate,
        mix: [
            { kind: "ai_assisted", count: 3, share: 0.75 },
            { kind: "agent_created", count: 1, share: 0.25 },
        ],
        totalAttributed: 4,
        hasMore: false,
        dataAvailable: true,
        rows: [
            {
                subjectType: "pull_request",
                subjectId: "101",
                repoId: "repo-1",
                provider: "github",
                kind: "ai_assisted",
                source: "pr_label",
                confidence: 0.9,
                actor: "github-copilot",
                evidence: '{"label":"ai-assisted"}',
                observedAt: "2026-04-15T00:00:00Z",
                teamId: "team-1",
            },
        ],
        ...overrides,
    };
}

describe("AIAttributionDashboard", () => {
    beforeEach(() => {
        mockUseAIAttributionOverview.mockReset();
    });

    it("renders the attribution mix and evidence rows with provenance", () => {
        mockUseAIAttributionOverview.mockReturnValue({
            data: overview(),
            fetching: false,
            error: undefined,
        });

        render(<AIAttributionDashboard filter={filter} />);

        const mixRows = screen.getAllByTestId("ai-attribution-mix-row");
        expect(mixRows).toHaveLength(2);
        expect(mixRows[0]).toHaveTextContent("75.0%");

        const evidenceRow = screen.getByTestId("ai-attribution-evidence-row");
        expect(evidenceRow).toBeInTheDocument();
        expect(within(evidenceRow).getByTestId("ai-attribution-badge")).toHaveTextContent(
            "AI-assisted",
        );
        expect(screen.getByText("pull_request #101")).toBeInTheDocument();
        expect(screen.getByText("github")).toBeInTheDocument();
        expect(screen.getByText("team-1")).toBeInTheDocument();
        expect(screen.getByTestId("ai-attribution-evidence-count")).toHaveTextContent(
            "4 resolved signals",
        );
    });

    it("renders an honest no-data state when nothing has resolved yet", () => {
        mockUseAIAttributionOverview.mockReturnValue({
            data: overview({ mix: [], rows: [], totalAttributed: 0, dataAvailable: false }),
            fetching: false,
            error: undefined,
        });

        render(<AIAttributionDashboard filter={filter} />);

        expect(screen.getByText("No AI attribution data yet")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-attribution-evidence-row")).not.toBeInTheDocument();
    });

    it("renders a distinct error state on request failure", () => {
        mockUseAIAttributionOverview.mockReturnValue({
            data: undefined,
            fetching: false,
            error: { message: "network exploded" },
        });

        render(<AIAttributionDashboard filter={filter} />);

        expect(screen.getByTestId("data-state-error")).toBeInTheDocument();
        expect(screen.getByText("network exploded")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-attribution-dashboard")).not.toBeInTheDocument();
    });

    it("shows a loading skeleton before the first response arrives", () => {
        mockUseAIAttributionOverview.mockReturnValue({
            data: undefined,
            fetching: true,
            error: undefined,
        });

        render(<AIAttributionDashboard filter={filter} />);

        expect(screen.getByTestId("ai-attribution-loading")).toBeInTheDocument();
    });

    it("keeps connected-but-zero-mix distinct from no-data-connected", () => {
        mockUseAIAttributionOverview.mockReturnValue({
            data: overview({ mix: [], dataAvailable: true }),
            fetching: false,
            error: undefined,
        });

        render(<AIAttributionDashboard filter={filter} />);

        // dataAvailable is true (evidence rows exist) even though mix is empty
        // for this page -- must not render the "no data at all" state.
        expect(screen.queryByText("No AI attribution data yet")).not.toBeInTheDocument();
        expect(screen.getByTestId("ai-attribution-evidence-row")).toBeInTheDocument();
    });

    it("paginates evidence and resets the offset when the filter changes", () => {
        mockUseAIAttributionOverview.mockImplementation(
            (_filter: AIFilter, _limit: number, offset = 0) =>
                offset === 0
                    ? { data: overview({ hasMore: true }), fetching: false, error: undefined }
                    : {
                          data: overview({ rows: [], hasMore: false }),
                          fetching: false,
                          error: undefined,
                      },
        );

        const { rerender } = render(<AIAttributionDashboard filter={filter} />);

        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(mockUseAIAttributionOverview).toHaveBeenLastCalledWith(filter, 25, 25);

        const narrower: AIFilter = { ...filter, teamId: "team-2" };
        rerender(<AIAttributionDashboard filter={narrower} />);
        expect(mockUseAIAttributionOverview).toHaveBeenLastCalledWith(narrower, 25, 0);
    });
});
