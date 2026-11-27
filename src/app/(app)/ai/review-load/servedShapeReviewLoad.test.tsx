import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackTheme } from "@/components/charts/chartTheme";
import type { AIFilter } from "@/lib/filters/ai";
import { render, screen } from "@/test/utils";

import { AIReviewLoadDashboard } from "@/components/ai/AIReviewLoadDashboard";

// Served-shape test. The ops schema type `AIReviewLoadRow` serves `day` on each
// `daily` row and the web AI_REVIEW_LOAD_QUERY asks for it. The trend reads
// `row.day`, so a served row without one (ops not rolled yet) draws no point and
// the existing empty state shows.
const { mockUseAIReviewLoad } = vi.hoisted(() => ({ mockUseAIReviewLoad: vi.fn() }));

vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return { ...actual, useAIReviewLoad: mockUseAIReviewLoad };
});
vi.mock("@/components/charts/chartTheme", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/charts/chartTheme")>()),
    useChartTheme: () => fallbackTheme,
}));
vi.mock("@/components/charts/Chart", () => ({
    Chart: ({ className }: { className?: string }) => (
        <div data-testid="chart" data-class={className ?? ""} />
    ),
}));
vi.mock("@/components/ai/AIEvidenceExplorer", () => ({
    AIEvidenceExplorer: () => <div data-testid="explorer-stub" />,
}));

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-04-03" };

// The shape ops serves for AIReviewLoadRow.
const servedRow = (bucket: string, amp: number, day?: string) => ({
    bucket,
    ...(day ? { day } : {}),
    prsTotal: 4,
    reviewsTotal: 8,
    reviewsPerPr: 2,
    changesRequestedPerPr: 0.5,
    reviewAmplification: amp,
    postFirstReviewPushesCount: 1,
    postFirstReviewPushesPerPr: 0.25,
    pickupLatencyHours: 3,
    reviewCommentsPerLoc: 0.01,
});

const served = (daily: ReturnType<typeof servedRow>[]) => ({
    fetching: false,
    error: undefined,
    data: {
        aiReviewLoad: {
            orgId: "org",
            startDate: "2026-04-01",
            endDate: "2026-04-03",
            dataAvailable: true,
            byBucket: [servedRow("ai_assisted", 1.5), servedRow("human", 1.1)],
            daily,
            reviewerConcentration: { dataAvailable: false, reviewerCount: 0, reviewerGini: null },
            missingStates: [],
        },
    },
});

describe("AIReviewLoadDashboard served shape (AIReviewLoadRow serves day)", () => {
    beforeEach(() => mockUseAIReviewLoad.mockReset());

    it("draws the review amplification trend from served daily rows", () => {
        mockUseAIReviewLoad.mockReturnValue(
            served([
                servedRow("ai_assisted", 1.4, "2026-04-01"),
                servedRow("ai_assisted", 1.6, "2026-04-02"),
                servedRow("human", 1.1, "2026-04-01"),
                servedRow("human", 1.0, "2026-04-02"),
            ]),
        );
        render(<AIReviewLoadDashboard filter={filter} />);
        const card = screen.getByTestId("ai-review-amplification-trend");
        expect(card).not.toHaveTextContent("No daily review amplification points appear");
        expect(screen.getByTestId("chart")).toBeInTheDocument();
    });

    it("the trend chart fills its h-72 card: Chart gets h-full (its own div has no height)", () => {
        mockUseAIReviewLoad.mockReturnValue(
            served([
                servedRow("ai_assisted", 1.4, "2026-04-01"),
                servedRow("human", 1.1, "2026-04-01"),
            ]),
        );
        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getByTestId("chart").getAttribute("data-class")).toContain("h-full");
    });

    it("rows without a day (ops not rolled yet) show the existing empty state, no error", () => {
        mockUseAIReviewLoad.mockReturnValue(
            served([servedRow("ai_assisted", 1.4), servedRow("human", 1.1)]),
        );
        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getByTestId("ai-review-amplification-trend")).toHaveTextContent(
            "No daily review amplification points appear",
        );
        expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    });

    it("control: empty served daily keeps the empty state", () => {
        mockUseAIReviewLoad.mockReturnValue(served([]));
        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getByTestId("ai-review-amplification-trend")).toHaveTextContent(
            "No daily review amplification points appear",
        );
        expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    });
});
