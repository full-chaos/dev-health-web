import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

const { mockUseAIRiskBreakdown } = vi.hoisted(() => ({ mockUseAIRiskBreakdown: vi.fn() }));

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return { ...actual, useAIRiskBreakdown: mockUseAIRiskBreakdown };
});

import { AITestGapsPanel } from "../AITestGapsPanel";
import { AIViolationsList } from "../AIViolationsList";

describe("Governance Risk look (CHAOS-7771)", () => {
    beforeEach(() => {
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: { dataAvailable: true, byBucket: [], missingStates: [] },
                aiComparison: { delta: {}, baselineSide: { testGapRate: 0.1 } },
            },
        });
    });

    it("lists findings in a table with severity, rule, PR and evidence columns", () => {
        render(
            <AIViolationsList
                violations={[
                    {
                        ruleId: "human-review-required",
                        severity: "high",
                        subjectType: "pr",
                        subjectId: "123",
                        teamId: "t",
                        repoId: "r",
                        observedAt: "2026-05-01T00:00:00Z",
                        evidence: "AI PR missing human review evidence",
                    },
                ]}
            />,
        );
        const table = screen.getByRole("table");
        for (const h of ["Severity", "Rule", "PR", "Evidence"]) {
            expect(within(table).getByRole("columnheader", { name: h })).toBeInTheDocument();
        }
        expect(within(table).getAllByRole("row")).toHaveLength(2);
    });

    it("uses the radius token on the card shell, not the old 3xl radius", () => {
        render(<AIViolationsList violations={[]} />);
        const cls = screen.getByTestId("ai-violations-list").className;
        expect(cls).toContain("rounded-(--radius-md)");
        expect(cls).not.toContain("rounded-3xl");
    });

    it("shows the aggregate-only note as an information notice with its label", () => {
        render(<AITestGapsPanel filter={{ startDate: "2026-04-01", endDate: "2026-05-01" }} />);
        const note = screen.getByTestId("ai-test-gap-evidence-note");
        const notice = note.closest("div[class*='border']");
        expect(notice).not.toBeNull();
        expect(notice).toHaveTextContent("Information");
    });
});
