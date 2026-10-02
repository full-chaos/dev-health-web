import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIAttributedPrs } = vi.hoisted(() => ({ mockUseAIAttributedPrs: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributedPrs: mockUseAIAttributedPrs,
    useAIWorkflowDrilldownForPr: () => ({ data: undefined, fetching: false, error: undefined }),
}));

import { AIImpactEvidenceList } from "../AIImpactEvidenceList";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };
const UUID = "11111111-2222-3333-4444-555555555555";

function withName(repoName: string | null | undefined) {
    mockUseAIAttributedPrs.mockReturnValue({
        data: {
            total: 1,
            hasMore: false,
            dataAvailable: true,
            rows: [
                {
                    repoId: UUID,
                    repoName,
                    number: 5,
                    title: "Add caching",
                    kind: "ai_assisted",
                    workType: "feature",
                    teamId: null,
                    mergedAt: null,
                },
            ],
        },
        fetching: false,
        error: undefined,
    });
}

// CHAOS-7982 (A5): the repository cell shows the name the API returns (CHAOS-7773).
describe("AIImpactEvidenceList repository names", () => {
    beforeEach(() => mockUseAIAttributedPrs.mockReset());

    it("shows repoName and no raw id or Unresolved badge when the API returns a name", () => {
        withName("Sample Repo");
        render(<AIImpactEvidenceList filter={filter} />);
        const row = screen.getByTestId("ai-impact-evidence-row");
        expect(row).toHaveTextContent("Sample Repo");
        expect(row).not.toHaveTextContent(UUID);
        expect(row).not.toHaveTextContent("Unresolved");
    });

    it.each([null, undefined, "", "   "])(
        "falls back to the short token with the Unresolved badge when repoName is %j",
        (name) => {
            withName(name);
            render(<AIImpactEvidenceList filter={filter} />);
            const row = screen.getByTestId("ai-impact-evidence-row");
            expect(row).toHaveTextContent("Unresolved");
            expect(row).not.toHaveTextContent(UUID);
        },
    );
});
