import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIAttributedPrs } = vi.hoisted(() => ({ mockUseAIAttributedPrs: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({
    useAIAttributedPrs: mockUseAIAttributedPrs,
    useAIWorkflowDrilldownForPr: () => ({ data: undefined, fetching: false, error: undefined }),
}));

import { AIImpactEvidenceList } from "../AIImpactEvidenceList";

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

describe("AIImpactEvidenceList look (CHAOS-7769)", () => {
    beforeEach(() => {
        mockUseAIAttributedPrs.mockReturnValue({
            data: {
                total: 1,
                hasMore: false,
                dataAvailable: true,
                rows: [
                    {
                        repoId: "11111111-2222-3333-4444-555555555555",
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
    });

    it("puts the evidence panel beside the table at wide screens", () => {
        render(<AIImpactEvidenceList filter={filter} />);
        expect(screen.getByTestId("ai-impact-evidence-list").className).toContain("xl:grid-cols-");
    });

    it("marks only the selected row with the orange selection edge", () => {
        render(<AIImpactEvidenceList filter={filter} />);
        const row = screen.getByTestId("ai-impact-evidence-row");
        expect(row.className).not.toContain("var(--accent)");
        fireEvent.click(row);
        expect(screen.getByTestId("ai-impact-evidence-row").className).toContain("var(--accent)");
    });

    it("never prints a raw repo id: it shows a short token with the Unresolved badge", () => {
        render(<AIImpactEvidenceList filter={filter} />);
        const row = screen.getByTestId("ai-impact-evidence-row");
        expect(row).not.toHaveTextContent("11111111-2222-3333-4444-555555555555");
        expect(row).toHaveTextContent("Unresolved");
    });
});
