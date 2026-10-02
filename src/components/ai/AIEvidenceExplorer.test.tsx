/** AIEvidenceExplorer component tests (moved from the retired AIDrilldownModal tests; CHAOS-1739, CHAOS-7775). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, userEvent, within } from "@/test/utils";

const { mockUseAIAttributedPrs, mockUseDrilldown } = vi.hoisted(() => ({
    mockUseAIAttributedPrs: vi.fn(),
    mockUseDrilldown: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributedPrs: mockUseAIAttributedPrs,
    useAIWorkflowDrilldownForPr: mockUseDrilldown,
}));

import { AIEvidenceExplorer } from "./AIEvidenceExplorer";
import type { AIFilter } from "@/lib/filters/ai";

const filter: AIFilter = {
    startDate: "2026-04-22",
    endDate: "2026-05-21",
};

function setEvidenceResult(value: ReturnType<typeof mockUseDrilldown>) {
    mockUseDrilldown.mockReturnValue(value as never);
}

function emptyEvidence() {
    return {
        fetching: false,
        error: undefined,
        data: undefined,
    };
}

describe("AIEvidenceExplorer", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReset();
        mockUseDrilldown.mockReset();
        setEvidenceResult(emptyEvidence());
    });

    afterEach(() => cleanup());

    it("renders empty state when zero AI-attributed PRs exist (data available)", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            // dataAvailable: true — an honest zero, not a missing population.
            data: { rows: [], total: 0, hasMore: false, dataAvailable: true },
            fetching: false,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByTestId("ai-drilldown-empty")).toBeInTheDocument();
        expect(screen.getByTestId("ai-drilldown-evidence-prompt")).toBeInTheDocument();
    });

    it("renders the missing-data panel, not the empty state, when dataAvailable=false", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: { rows: [], total: 0, hasMore: false, dataAvailable: false },
            fetching: false,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByTestId("ai-evidence-unavailable")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-drilldown-empty")).not.toBeInTheDocument();
        expect(screen.queryByTestId("ai-drilldown-search")).not.toBeInTheDocument();
    });

    it("renders loading state while fetching", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: undefined,
            fetching: true,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByTestId("ai-drilldown-loading")).toBeInTheDocument();
    });

    it("renders PR rows and shows evidence prompt until a PR is selected", async () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                rows: [
                    {
                        repoId: "11111111-1111-1111-1111-111111111111",
                        number: 42,
                        title: "Add feature flag",
                        kind: "copilot",
                        workType: "pull_request",
                        teamId: null,
                        mergedAt: "2026-05-10T12:00:00Z",
                    },
                    {
                        repoId: "11111111-1111-1111-1111-111111111111",
                        number: 43,
                        title: "Refactor auth",
                        kind: "cursor",
                        workType: "pull_request",
                        teamId: null,
                        mergedAt: null,
                    },
                ],
                total: 2,
                hasMore: false,
                dataAvailable: true,
            },
            fetching: false,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByText("Add feature flag")).toBeInTheDocument();
        expect(screen.getByText("Refactor auth")).toBeInTheDocument();
        expect(screen.getByTestId("ai-drilldown-evidence-prompt")).toBeInTheDocument();
    });

    it("calls aiWorkflowDrilldown with the selected PR and renders evidence edges", async () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                rows: [
                    {
                        repoId: "11111111-1111-1111-1111-111111111111",
                        number: 42,
                        title: "Add feature flag",
                        kind: "copilot",
                        workType: "pull_request",
                        teamId: null,
                        mergedAt: "2026-05-10T12:00:00Z",
                    },
                ],
                total: 1,
                hasMore: false,
                dataAvailable: true,
            },
            fetching: false,
            error: undefined,
        });
        setEvidenceResult({
            fetching: false,
            error: undefined,
            data: {
                orgId: "org-test",
                rootType: "PR",
                rootId: "11111111-1111-1111-1111-111111111111:42",
                partial: false,
                dataAvailable: true,
                nodes: [
                    { nodeType: "pr", nodeId: "11111111-1111-1111-1111-111111111111:42" },
                    { nodeType: "ai_workflow_run", nodeId: "run-1" },
                ],
                edges: [
                    {
                        edgeId: "edge-1",
                        sourceType: "pr",
                        sourceId: "11111111-1111-1111-1111-111111111111:42",
                        targetType: "ai_workflow_run",
                        targetId: "run-1",
                        edgeType: "has_ai_workflow",
                        confidence: 0.9,
                        source: "pr_label",
                        evidence: "label:ai-assisted",
                        provider: "github",
                        repoId: "11111111-1111-1111-1111-111111111111",
                    },
                ],
            },
        });

        render(<AIEvidenceExplorer filter={filter} />);

        const row = screen.getByTestId("ai-drilldown-table");
        await userEvent.click(within(row).getByText("Add feature flag"));

        const lastCall = mockUseDrilldown.mock.calls.at(-1);
        expect(lastCall?.[0]).toBe("11111111-1111-1111-1111-111111111111:42");

        expect(screen.getByTestId("ai-drilldown-evidence")).toBeInTheDocument();
        expect(screen.getByText(/has_ai_workflow/i)).toBeInTheDocument();
        expect(screen.getByText(/label:ai-assisted/i)).toBeInTheDocument();
    });

    it("renders error banner when AI-attributed PRs query fails", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: undefined,
            fetching: false,
            error: { message: "ClickHouse unavailable" },
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByTestId("ai-drilldown-error")).toHaveTextContent(
            /ClickHouse unavailable/,
        );
    });

    it("filters PR rows by the search input", async () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                rows: [
                    {
                        repoId: "r",
                        number: 100,
                        title: "Add OAuth",
                        kind: "copilot",
                        workType: "feature",
                        teamId: null,
                        mergedAt: null,
                    },
                    {
                        repoId: "r",
                        number: 101,
                        title: "Refactor logger",
                        kind: "copilot",
                        workType: "tech-debt",
                        teamId: null,
                        mergedAt: null,
                    },
                ],
                total: 2,
                hasMore: false,
                dataAvailable: true,
            },
            fetching: false,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        await userEvent.type(screen.getByTestId("ai-drilldown-search"), "logger");

        expect(screen.queryByText("Add OAuth")).not.toBeInTheDocument();
        expect(screen.getByText("Refactor logger")).toBeInTheDocument();
    });

    it("does not leak resolver names in user-facing copy", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: { rows: [], total: 0, hasMore: false, dataAvailable: true },
            fetching: false,
            error: undefined,
        });

        render(<AIEvidenceExplorer filter={filter} />);

        const text = document.body.textContent ?? "";
        expect(text).not.toMatch(/aiWorkflowDrilldown/);
        expect(text).not.toMatch(/rootType/);
        expect(text).not.toMatch(/fabricat/i);
    });
});
