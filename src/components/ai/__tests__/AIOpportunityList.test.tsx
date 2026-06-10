import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

import { AIOpportunityList } from "../AIOpportunityList";
import type { AiOpportunity } from "@/lib/graphql/__generated__/types";

const { mockUseAIWorkflowDrilldown } = vi.hoisted(() => ({ mockUseAIWorkflowDrilldown: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIWorkflowDrilldown: mockUseAIWorkflowDrilldown,
}));

const recommendation: AiOpportunity = {
    opportunityId: "opp-1",
    kind: "HIGH_REVIEW_LOAD",
    repoId: "repo-1",
    teamId: "team-platform",
    title: "Automate dependency updates",
    rationale: "Recurring dependency PRs match the AI-assisted heuristic.",
    score: 0.78,
    evidenceRefs: ["git_pull_requests:repo-1:1001"],
    workGraphDrilldowns: [{ rootType: "pr", rootId: "repo-1#1001", label: "PR 1001" }],
};

describe("AIOpportunityList", () => {
    beforeEach(() => {
        mockUseAIWorkflowDrilldown.mockReset();
        mockUseAIWorkflowDrilldown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                orgId: "org",
                rootType: "PR",
                rootId: "repo-1#1001",
                partial: false,
                dataAvailable: true,
                nodes: [{ nodeType: "PR", nodeId: "repo-1#1001" }],
                edges: [
                    {
                        edgeId: "edge-1",
                        sourceType: "PR",
                        sourceId: "repo-1#1001",
                        targetType: "REVIEW_OUTCOME",
                        targetId: "approved",
                        edgeType: "HAS_REVIEW_OUTCOME",
                        confidence: 0.9,
                        source: "msw",
                        evidence: "Approved after focused updates.",
                        provider: "github",
                        repoId: "repo-1",
                    },
                ],
            },
        });
    });

    it("opens Work Graph evidence from recommendation drilldown refs", async () => {
        render(<AIOpportunityList detectorReady recommendations={[recommendation]} />);

        await userEvent.click(screen.getByRole("button", { name: /Work Graph: PR 1001/i }));

        expect(mockUseAIWorkflowDrilldown).toHaveBeenCalledWith("pr", "repo-1#1001", { limit: 25 });
        expect(screen.getByTestId("ai-opportunity-workgraph-evidence")).toHaveTextContent(
            "HAS_REVIEW_OUTCOME",
        );
        expect(screen.getByTestId("ai-opportunity-workgraph-evidence")).toHaveTextContent(
            "Approved after focused updates.",
        );
    });
});
