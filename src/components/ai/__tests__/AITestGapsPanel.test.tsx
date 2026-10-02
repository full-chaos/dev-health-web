import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import type { AIFilter } from "@/lib/filters/ai";

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

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

function populated(dataAvailable = true) {
    mockUseAIRiskBreakdown.mockReturnValue({
        fetching: false,
        error: undefined,
        data: {
            aiRiskBreakdown: {
                dataAvailable,
                byBucket: [
                    {
                        bucket: "ai_assisted",
                        prsTotal: 20,
                        testGapPrs: 3,
                        testGapRate: 0.15,
                    },
                ],
                missingStates: [],
            },
            aiComparison: {
                delta: { testGapRateDelta: 0.05 },
                baselineSide: { testGapRate: 0.1 },
            },
        },
    });
}

describe("AITestGapsPanel", () => {
    beforeEach(() => mockUseAIRiskBreakdown.mockReset());

    it("keeps the three cards, their texts and test ids", () => {
        populated();
        render(<AITestGapsPanel filter={filter} />);
        expect(screen.getByTestId("ai-test-gaps-panel")).toBeInTheDocument();
        expect(screen.getByText("Test gap rate")).toBeInTheDocument();
        expect(screen.getByTestId("ai-test-gap-baseline")).toHaveTextContent(
            "Baseline test gap rate",
        );
        expect(screen.getByTestId("ai-test-gap-baseline")).toHaveTextContent("10.00 %");
        const prs = screen.getByTestId("ai-test-gap-prs");
        expect(prs).toHaveTextContent("PRs with test gaps");
        expect(prs).toHaveTextContent("out of 20 AI-attributed PRs in range.");
        expect(prs).toHaveTextContent("3");
    });

    it("keeps the aggregate-only evidence note", () => {
        populated();
        render(<AITestGapsPanel filter={filter} />);
        expect(screen.getByTestId("ai-test-gap-evidence-note")).toHaveTextContent(
            "Per-PR test-gap evidence is not available yet — these counts are aggregate-only until the underlying signal links individual pull requests.",
        );
    });

    it("shows a dash, not a zero, when the baseline is missing", () => {
        populated();
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: { dataAvailable: true, byBucket: [], missingStates: [] },
                aiComparison: { delta: {}, baselineSide: { testGapRate: null } },
            },
        });
        render(<AITestGapsPanel filter={filter} />);
        expect(screen.getByTestId("ai-test-gap-baseline")).toHaveTextContent("—");
        expect(screen.getByTestId("ai-test-gap-baseline")).not.toHaveTextContent("0.00");
    });

    it("keeps the unavailable and error states", () => {
        populated(false);
        const { unmount } = render(<AITestGapsPanel filter={filter} />);
        expect(screen.getByText("AI test-gap data is not available")).toBeInTheDocument();
        unmount();
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            data: undefined,
            error: new Error("boom"),
        });
        render(<AITestGapsPanel filter={filter} />);
        expect(screen.getByText("Failed to load AI test gaps")).toBeInTheDocument();
    });
});
