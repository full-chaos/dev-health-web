import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIReviewLoadDashboard } from "../AIReviewLoadDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIReviewLoad } = vi.hoisted(() => ({ mockUseAIReviewLoad: vi.fn() }));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async () => {
  return {
    useAIReviewLoad: mockUseAIReviewLoad,
    findBucketRow: <T extends { bucket: string }>(rows: T[] | undefined, bucket = "AI_ASSISTED") => rows?.find((row) => row.bucket === bucket) ?? rows?.find((row) => row.bucket !== "HUMAN"),
    valueDelta: (value?: number | null, baseline?: number | null) => value == null || baseline == null ? undefined : value - baseline,
    approvalFriction: (row?: { changesRequestedPerPr?: number | null; reviewsPerPr?: number | null }) => !row?.reviewsPerPr || row.changesRequestedPerPr == null ? undefined : row.changesRequestedPerPr / row.reviewsPerPr,
  };
});

vi.mock("../AIReviewAmplificationTrend", () => ({
  AIReviewAmplificationTrend: ({ loading }: { loading?: boolean }) => <div data-testid="trend">{loading ? "loading" : "ready"}</div>,
}));

const filter: AIFilter = { dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" }, scope: {} };

describe("AIReviewLoadDashboard", () => {
  beforeEach(() => mockUseAIReviewLoad.mockReset());

  it("renders fetching state", () => {
    mockUseAIReviewLoad.mockReturnValue({ data: undefined, fetching: true, error: undefined });
    render(<AIReviewLoadDashboard filter={filter} />);
    expect(screen.getAllByText("Loading baseline…").length).toBeGreaterThan(0);
    expect(screen.getByTestId("trend")).toHaveTextContent("loading");
  });

  it("renders populated cards and derived friction", () => {
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
            { bucket: "AI_ASSISTED", prsTotal: 10, reviewsTotal: 30, reviewsPerPr: 3, changesRequestedPerPr: 1.5, reviewAmplification: 1.8 },
            { bucket: "HUMAN", prsTotal: 10, reviewsTotal: 20, reviewsPerPr: 2, changesRequestedPerPr: 0.5, reviewAmplification: 1.1 },
          ],
          daily: [],
        },
        aiComparison: {
          orgId: "org",
          startDate: "2026-04-01",
          endDate: "2026-05-01",
          dataAvailable: true,
          aiSide: { bucket: "AI_ASSISTED", prsTotal: 10, prsMerged: 8, cycleTimeAvgHours: 9, reviewsPerPr: 3 },
          baselineSide: { bucket: "HUMAN", prsTotal: 10, prsMerged: 8, cycleTimeAvgHours: 7, reviewsPerPr: 2 },
          delta: { cycleTimeDeltaHours: 2, reviewsPerPrDelta: 1 },
        },
      },
    });

    render(<AIReviewLoadDashboard filter={filter} />);
    expect(screen.getByText("Pickup latency")).toBeInTheDocument();
    expect(screen.getByText("Approval friction")).toBeInTheDocument();
    expect(screen.getByText("0.50")).toBeInTheDocument();
  });

  it("renders data_available false empty state", () => {
    mockUseAIReviewLoad.mockReturnValue({
      fetching: false,
      error: undefined,
      data: { aiReviewLoad: { orgId: "org", startDate: "2026-04-01", endDate: "2026-05-01", dataAvailable: false, byBucket: [], daily: [] } },
    });
    render(<AIReviewLoadDashboard filter={filter} />);
    expect(screen.getByText("AI review load data is not available")).toBeInTheDocument();
  });
});
