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
                    {
                        nodeType: "pr",
                        nodeId: "11111111-1111-1111-1111-111111111111:42",
                        displayName: "Add feature flag",
                        nameExpected: true,
                    },
                    // A node type with no name by design: null name, and the flag says so.
                    {
                        nodeType: "ai_workflow_run",
                        nodeId: "run-1",
                        displayName: null,
                        nameExpected: false,
                    },
                    // A type that carries a name, and none is served: a gap.
                    { nodeType: "pr", nodeId: "gap-pr", displayName: null, nameExpected: true },
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
                    {
                        edgeId: "edge-2",
                        sourceType: "pr",
                        sourceId: "gap-pr",
                        targetType: "ai_workflow_run",
                        targetId: "run-1",
                        edgeType: "has_ai_workflow",
                        confidence: 0.5,
                        source: "pr_label",
                        evidence: "label:second",
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
        // CHAOS-8093: words for the edge type. CHAOS-8113: each end reads as its type and the served
        // name of its node. A type with no name by design (the served flag) reads as its type words
        // alone; a type that carries a name and has none served reads "Not reported". Never the id.
        expect(screen.getAllByText("Has AI workflow")).toHaveLength(2);
        expect(screen.queryByText(/has_ai_workflow/i)).not.toBeInTheDocument();
        const allEnds = screen.getAllByTestId("ai-edge-ends");
        expect(allEnds.map((end) => end.textContent)).toEqual([
            "PR Add feature flag → AI workflow run",
            "PR Not reported → AI workflow run",
        ]);
        const ends = allEnds[0];
        for (const end of allEnds) {
            expect(end).not.toHaveTextContent("pr:");
            expect(end).not.toHaveTextContent("run-1");
            expect(end).not.toHaveTextContent("gap-pr");
            expect(end).not.toHaveTextContent("11111111");
        }
        // CHAOS-8216: a titled side panel beside the table, the count line, a "confidence" word,
        // and the selected row marked.
        const panel = screen.getByTestId("ai-work-graph-evidence");
        expect(
            within(panel).getByRole("heading", { level: 3, name: "Work Graph evidence · PR #42" }),
        ).toBeInTheDocument();
        expect(panel).toHaveTextContent("3 nodes · 2 edges");
        expect(panel).toHaveTextContent("confidence 0.90");
        expect(panel).not.toHaveTextContent("conf 0.90");
        expect(screen.queryByTestId("ai-evidence-partial")).not.toBeInTheDocument();
        expect(within(row).getByText("Add feature flag").closest("tr")).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(ends).not.toHaveTextContent("11111111-1111-1111-1111-111111111111");
        expect(screen.getByText(/label:ai-assisted/i)).toBeInTheDocument();
    });

    it("renders error banner when AI-attributed PRs query fails", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: undefined,
            fetching: false,
            error: { message: "ClickHouse unavailable" },
        });

        render(<AIEvidenceExplorer filter={filter} />);

        expect(screen.getByTestId("ai-drilldown-error")).toHaveTextContent(/Could not be read/);
        expect(screen.queryByText(/ClickHouse unavailable/)).toBeNull();
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

describe("AIEvidenceExplorer layout (CHAOS-8297)", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReset();
        mockUseDrilldown.mockReset();
        setEvidenceResult(emptyEvidence());
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                rows: [
                    {
                        repoId: "r1",
                        number: 42,
                        title: "Add feature flag",
                        kind: "copilot",
                        workType: "pull_request",
                        teamId: null,
                        mergedAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
                dataAvailable: true,
            },
            fetching: false,
            error: undefined,
        });
    });
    afterEach(() => cleanup());

    it("side (default): the evidence panel is beside the table, in a two-column grid (A6)", () => {
        const { container } = render(<AIEvidenceExplorer filter={filter} />);
        const panel = screen.getByTestId("ai-work-graph-evidence");
        expect(container.firstElementChild?.className).toContain("lg:grid-cols-");
        expect(container.firstElementChild).toContainElement(panel);
        expect(panel.className).toContain("lg:pt-1");
    });

    it("stacked: the evidence sits under the table, no grid, and keeps its title, prompt and test id (A8)", async () => {
        const user = userEvent.setup();
        const { container } = render(<AIEvidenceExplorer filter={filter} layout="stacked" />);
        expect(container.firstElementChild?.className).not.toContain("grid-cols-");
        const table = screen.getByTestId("ai-drilldown-table");
        const panel = screen.getByTestId("ai-work-graph-evidence");
        expect(
            table.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(within(panel).getByTestId("ai-drilldown-evidence-prompt")).toBeInTheDocument();
        expect(
            within(panel).getByRole("heading", { name: "Work Graph evidence" }),
        ).toBeInTheDocument();
        await user.click(screen.getByTestId("ai-drilldown-pr-row"));
        expect(
            within(screen.getByTestId("ai-work-graph-evidence")).getByRole("heading", {
                name: "Work Graph evidence · PR #42",
            }),
        ).toBeInTheDocument();
    });
});

describe("AIEvidenceExplorer concept details (search icon, edge confidence line)", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReset();
        mockUseDrilldown.mockReset();
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                rows: [
                    {
                        repoId: "r1",
                        number: 42,
                        title: "Add feature flag",
                        kind: "copilot",
                        workType: "pull_request",
                        teamId: null,
                        mergedAt: null,
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
                dataAvailable: true,
                partial: false,
                nodes: [{}, {}],
                edges: [
                    {
                        edgeId: "e1",
                        edgeType: "PR_LINKS_ISSUE",
                        sourceType: "pull_request",
                        sourceId: "pr:r1#42",
                        targetType: "issue",
                        targetId: "ABC-1",
                        provider: "github",
                        confidence: 0.94,
                        evidence: "Linked in the PR body",
                    },
                ],
            },
        } as never);
    });
    afterEach(() => cleanup());

    it("the Filter PRs field has a decorative search icon inside it", () => {
        render(<AIEvidenceExplorer filter={filter} />);
        const input = screen.getByTestId("ai-drilldown-search");
        const svg = input.parentElement?.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(input.className).toContain("pl-10");
    });

    it("the edge confidence is in the head row beside the provider, not on its own line", async () => {
        const user = userEvent.setup();
        render(<AIEvidenceExplorer filter={filter} />);
        await user.click(screen.getByTestId("ai-drilldown-pr-row"));
        const confidence = screen.getByTestId("ai-edge-confidence");
        expect(confidence).toHaveTextContent("confidence 0.94");
        const head = screen.getByTestId("ai-edge-ends").parentElement;
        expect(head).toContainElement(confidence);
        expect(head).toContainElement(screen.getByText("github"));
    });
});
