import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIAttributedPrs, mockUseAIWorkflowDrilldown } = vi.hoisted(() => ({
    mockUseAIAttributedPrs: vi.fn(),
    mockUseAIWorkflowDrilldown: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributedPrs: mockUseAIAttributedPrs,
    useAIWorkflowDrilldownForPr: mockUseAIWorkflowDrilldown,
}));

import { AIImpactEvidenceList } from "../AIImpactEvidenceList";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

function attributedPrs(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        orgId: "org",
        startDate: filter.startDate,
        endDate: filter.endDate,
        total: 1,
        hasMore: false,
        dataAvailable: true,
        rows: [
            {
                repoId: "repo-1",
                number: 42,
                title: "Add caching",
                kind: "ai_assisted",
                workType: "feature",
                teamId: "team-1",
                mergedAt: null,
            },
        ],
        ...overrides,
    };
}

describe("AIImpactEvidenceList", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReset();
        mockUseAIWorkflowDrilldown.mockReset();
        mockUseAIWorkflowDrilldown.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
    });

    it("renders attributed PR rows with provenance badges", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs(),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        expect(screen.getByTestId("ai-impact-evidence-row")).toBeInTheDocument();
        expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent("AI-assisted");
        expect(screen.getByTestId("ai-impact-evidence-count")).toHaveTextContent(
            "1 AI-attributed PRs",
        );
    });

    it("shows the degraded sparse-page state when a page is empty but the total is not", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs({ rows: [], total: 37, hasMore: false }),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        const sparse = screen.getByTestId("ai-impact-evidence-sparse-page");
        expect(sparse).toHaveTextContent("This page of results could not be loaded");
        expect(sparse).toHaveTextContent("37 AI-attributed PRs");
        // Pagination stays reachable so the user can navigate back.
        expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
        expect(screen.queryByTestId("ai-impact-evidence-row")).not.toBeInTheDocument();
    });

    it("keeps connected-but-zero distinct from the sparse-page state", () => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: attributedPrs({ rows: [], total: 0 }),
            fetching: false,
            error: undefined,
        });

        render(<AIImpactEvidenceList filter={filter} />);

        expect(screen.getByText("No AI-attributed PRs in this range")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-impact-evidence-sparse-page")).not.toBeInTheDocument();
    });
});
