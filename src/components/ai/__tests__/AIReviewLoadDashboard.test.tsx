import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIReviewLoadDashboard } from "../AIReviewLoadDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIReviewLoad } = vi.hoisted(() => ({ mockUseAIReviewLoad: vi.fn() }));

// Stub the transitive urql/provider imports so importOriginal can load the
// real useAIReviewRisk module under vitest (same pattern as the adapters test).
vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));

// Mock ONLY the data hook; findBucketRow/valueDelta/approvalFriction must be
// the real implementations so this suite exercises the production
// bucket-normalization path (uppercase request vs lowercase rows, CHAOS-2225).
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return {
        ...actual,
        useAIReviewLoad: mockUseAIReviewLoad,
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
                            pickupLatencyHours: 9,
                            reviewCommentsPerLoc: 0.05,
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
                            pickupLatencyHours: 7,
                            reviewCommentsPerLoc: 0.02,
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
        expect(screen.getByText("Review comments per LOC")).toBeInTheDocument();
        expect(screen.getByText("0.050")).toBeInTheDocument();
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
