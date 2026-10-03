import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { STATUS_PILL } from "@/lib/statusPill";
import type { AiOpportunity } from "@/lib/graphql/__generated__/types";

// CHAOS-7883: status colors in the AI evidence views come from the status tokens
// (STATUS_PILL), never from raw palette classes.
const { mockAttributed, mockDrillPr, mockDrill, mockRisk, mockGov } = vi.hoisted(() => ({
    mockAttributed: vi.fn(),
    mockDrillPr: vi.fn(),
    mockDrill: vi.fn(),
    mockRisk: vi.fn(),
    mockGov: vi.fn(),
}));

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return {
        ...actual,
        useAIAttributedPrs: mockAttributed,
        useAIWorkflowDrilldownForPr: mockDrillPr,
        useAIWorkflowDrilldown: mockDrill,
        useAIRiskBreakdown: mockRisk,
        useAIGovernanceSummary: mockGov,
    };
});

import { AIEvidenceExplorer } from "../AIEvidenceExplorer";
import { AIOpportunityList } from "../AIOpportunityList";
import { AIRiskDashboard } from "../AIRiskDashboard";

const filter = { startDate: "2026-04-01", endDate: "2026-05-01" };
const row = {
    repoId: "r",
    number: 1,
    title: "t",
    kind: "ai_assisted",
    workType: "feature",
    teamId: null,
    mergedAt: null,
};

describe("AI evidence status tokens (CHAOS-7883)", () => {
    beforeEach(() => {
        for (const m of [mockAttributed, mockDrillPr, mockDrill, mockRisk, mockGov]) m.mockReset();
        mockDrillPr.mockReturnValue({ data: undefined, fetching: false, error: undefined });
        mockGov.mockReturnValue({ data: undefined, fetching: false, error: undefined });
    });

    it("explorer: the PR query error line uses the negative status token", () => {
        mockAttributed.mockReturnValue({
            data: undefined,
            fetching: false,
            error: { message: "x" },
        });
        render(<AIEvidenceExplorer filter={filter} />);
        expect(screen.getByTestId("ai-drilldown-error").className).toContain(STATUS_PILL.negative);
    });

    it("explorer: the evidence error line uses the negative status token", async () => {
        mockAttributed.mockReturnValue({
            data: { rows: [row], total: 1, hasMore: false, dataAvailable: true },
            fetching: false,
            error: undefined,
        });
        mockDrillPr.mockReturnValue({ data: undefined, fetching: false, error: { message: "e" } });
        render(<AIEvidenceExplorer filter={filter} />);
        await userEvent.click(screen.getByText("t"));
        expect(screen.getByTestId("ai-drilldown-evidence-error").className).toContain(
            STATUS_PILL.negative,
        );
    });

    it("explorer: the partial pill uses the caution status token", async () => {
        mockAttributed.mockReturnValue({
            data: { rows: [row], total: 1, hasMore: false, dataAvailable: true },
            fetching: false,
            error: undefined,
        });
        mockDrillPr.mockReturnValue({
            fetching: false,
            error: undefined,
            data: { dataAvailable: true, partial: true, nodes: [], edges: [] },
        });
        render(<AIEvidenceExplorer filter={filter} />);
        await userEvent.click(screen.getByText("t"));
        expect(screen.getByText("Partial").className).toContain(STATUS_PILL.caution);
    });

    it("opportunity list: the evidence error line uses the negative status token", async () => {
        mockDrill.mockReturnValue({ data: undefined, fetching: false, error: { message: "e" } });
        const item = {
            opportunityId: "o1",
            title: "T",
            rationale: "r",
            score: 0.5,
            kind: "repeat_work",
            repoId: null,
            teamId: null,
            workGraphDrilldowns: [{ rootType: "pr", rootId: "r1", label: "PR 1" }],
        } as unknown as AiOpportunity;
        render(<AIOpportunityList detectorReady recommendations={[item]} />);
        await userEvent.click(screen.getByRole("button", { name: "Work Graph: PR 1" }));
        expect(screen.getByText(/Evidence unavailable/).className).toContain(STATUS_PILL.negative);
    });

    it("risk dashboard: the governance error line uses the negative status token", () => {
        mockRisk.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: {
                    dataAvailable: true,
                    byBucket: [],
                    hotspotOverlap: [],
                    complexityOverlap: [],
                    missingStates: [],
                },
                aiComparison: { delta: {} },
            },
        });
        mockGov.mockReturnValue({ data: undefined, fetching: false, error: { message: "g" } });
        render(<AIRiskDashboard filter={filter} />);
        expect(screen.getByText(/Governance findings unavailable/).className).toContain(
            STATUS_PILL.negative,
        );
    });
});
