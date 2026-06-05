import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIReviewLoadDashboard } from "../AIReviewLoadDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIReviewLoad } = vi.hoisted(() => ({ mockUseAIReviewLoad: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async () => {
    const normalizeBucket = (bucket: string) => bucket.trim().toLowerCase();
    return {
        useAIReviewLoad: mockUseAIReviewLoad,
        findBucketRow: <T extends { bucket: string }>(
            rows: T[] | undefined,
            bucket = "AI_ASSISTED",
        ) => {
            const targetBucket = normalizeBucket(bucket);
            return rows?.find((row) => normalizeBucket(row.bucket) === targetBucket);
        },
        valueDelta: (value?: number | null, baseline?: number | null) =>
            value == null || baseline == null ? undefined : value - baseline,
        approvalFriction: (row?: {
            changesRequestedPerPr?: number | null;
            reviewsPerPr?: number | null;
        }) =>
            !row?.reviewsPerPr || row.changesRequestedPerPr == null
                ? undefined
                : row.changesRequestedPerPr / row.reviewsPerPr,
    };
});

vi.mock("../AIReviewAmplificationTrend", () => ({
    AIReviewAmplificationTrend: ({ loading }: { loading?: boolean }) => (
        <div data-testid="trend">{loading ? "loading" : "ready"}</div>
    ),
}));

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

describe("AIReviewLoadDashboard", () => {
    beforeEach(() => mockUseAIReviewLoad.mockReset());

    it("renders fetching state", () => {
        mockUseAIReviewLoad.mockReturnValue({ data: undefined, fetching: true, error: undefined });
        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getAllByText("Loading baseline…").length).toBeGreaterThan(0);
        expect(screen.getByTestId("trend")).toHaveTextContent("loading");
    });

    it("renders all populated metric cards and derived friction", () => {
        mockUseAIReviewLoad.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiReviewLoad: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: true,
                    byBucket: [
                        {
                            bucket: "ai_assisted",
                            prsTotal: 10,
                            reviewsTotal: 30,
                            reviewsPerPr: 3,
                            changesRequestedPerPr: 1.5,
                            reviewAmplification: 1.8,
                            postFirstReviewPushesCount: 4,
                            postFirstReviewPushesPerPr: 0.4,
                        },
                        {
                            bucket: "human",
                            prsTotal: 10,
                            reviewsTotal: 20,
                            reviewsPerPr: 2,
                            changesRequestedPerPr: 0.5,
                            reviewAmplification: 1.1,
                            postFirstReviewPushesCount: 2,
                            postFirstReviewPushesPerPr: 0.2,
                        },
                    ],
                    daily: [],
                    reviewerConcentration: {
                        dataAvailable: true,
                        reviewerCount: 5,
                        reviewerGini: 0.42,
                    },
                    missingStates: [],
                },
                aiComparison: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: true,
                    aiSide: {
                        bucket: "ai_assisted",
                        prsTotal: 10,
                        prsMerged: 8,
                        cycleTimeAvgHours: 9,
                        reviewsPerPr: 3,
                    },
                    baselineSide: {
                        bucket: "human",
                        prsTotal: 10,
                        prsMerged: 8,
                        cycleTimeAvgHours: 7,
                        reviewsPerPr: 2,
                    },
                    delta: { cycleTimeDeltaHours: 2, reviewsPerPrDelta: 1 },
                },
            },
        });

        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getByText("Pickup latency")).toBeInTheDocument();
        expect(screen.getByText("9.00 h")).toBeInTheDocument();
        expect(screen.getByText("Review comments per PR")).toBeInTheDocument();
        expect(screen.getByText("3.00")).toBeInTheDocument();
        expect(screen.getByText("Change request rate")).toBeInTheDocument();
        expect(screen.getByText("1.50")).toBeInTheDocument();
        expect(screen.getByText("Approval friction")).toBeInTheDocument();
        expect(screen.getByText("0.50")).toBeInTheDocument();
        expect(screen.getByText("Push iterations after first review")).toBeInTheDocument();
        expect(screen.getByTestId("ai-reviewer-concentration")).toHaveTextContent("0.42");
        expect(screen.getByTestId("ai-reviewer-concentration")).toHaveTextContent("5");
    });

    it("renders data_available false empty state", () => {
        mockUseAIReviewLoad.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiReviewLoad: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: false,
                    byBucket: [],
                    daily: [],
                    reviewerConcentration: {
                        dataAvailable: false,
                        reviewerCount: 0,
                        reviewerGini: null,
                    },
                    missingStates: [],
                },
            },
        });
        render(<AIReviewLoadDashboard filter={filter} />);
        expect(screen.getByText("AI review load data is not available")).toBeInTheDocument();
    });
});
