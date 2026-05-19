import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

const { mockUseAIImpactSummary, mockUseAIComparison, mockUseAIOpportunities } = vi.hoisted(() => ({
  mockUseAIImpactSummary: vi.fn(),
  mockUseAIComparison: vi.fn(),
  mockUseAIOpportunities: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({
  useAIImpactSummary: mockUseAIImpactSummary,
  useAIComparison: mockUseAIComparison,
  useAIOpportunities: mockUseAIOpportunities,
}));

vi.mock("@/components/charts/DonutChart", () => ({
  DonutChart: ({ data }: { data: Array<{ name: string; value: number }> }) => <div data-testid="donut-chart">{data.map((item) => item.name).join(",")}</div>,
}));

vi.mock("@/components/charts/TimeseriesChart", () => ({
  TimeseriesChart: ({ data }: { data: Array<{ day: string; value: number }> }) => <div data-testid="timeseries-chart">{data.length}</div>,
}));

vi.mock("@/components/charts/VerticalBarChart", () => ({
  VerticalBarChart: ({ categories }: { categories: string[] }) => <div data-testid="vertical-bar-chart">{categories.join(",")}</div>,
}));

vi.mock("@/components/charts/SparklineChart", () => ({
  SparklineChart: ({ data }: { data: number[] }) => <div data-testid="sparkline-chart">{data.join(",")}</div>,
}));

import { AIImpactDashboard } from "./AIImpactDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const filter: AIFilter = { startDate: "2026-04-20", endDate: "2026-05-19" };

function mockDefaults() {
  mockUseAIOpportunities.mockReturnValue({ data: { aiOpportunities: { orgId: "org", detectorReady: false, recommendations: [] } }, fetching: false, error: undefined });
  mockUseAIComparison.mockReturnValue({
    data: {
      aiComparison: {
        orgId: "org",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        dataAvailable: true,
        aiSide: { bucket: "AI_ASSISTED", prsTotal: 8, prsMerged: 7, reviewsPerPr: 2.4, reworkRate: 0.2, testGapRate: 0.1, revertRate: 0.05, incidentRate: 0.02, cycleTimeAvgHours: 20 },
        baselineSide: { bucket: "HUMAN", prsTotal: 10, prsMerged: 9, reviewsPerPr: 1.8, reworkRate: 0.1, testGapRate: 0.05, revertRate: 0.02, incidentRate: 0.01, cycleTimeAvgHours: 24 },
        delta: { reviewsPerPrDelta: 0.6, reworkRateDelta: 0.1, testGapRateDelta: 0.05, revertRateDelta: 0.03, incidentRateDelta: 0.01, cycleTimeDeltaHours: -4 },
      },
    },
    fetching: false,
    error: undefined,
  });
}

describe("AIImpactDashboard", () => {
  beforeEach(() => {
    mockUseAIImpactSummary.mockReset();
    mockUseAIComparison.mockReset();
    mockUseAIOpportunities.mockReset();
    mockDefaults();
  });

  afterEach(() => cleanup());

  it("renders a loading state while queries fetch", () => {
    mockUseAIImpactSummary.mockReturnValue({ data: undefined, fetching: true, error: undefined });
    mockUseAIComparison.mockReturnValue({ data: undefined, fetching: true, error: undefined });

    render(<AIImpactDashboard filter={filter} />);

    expect(screen.getByTestId("ai-impact-loading")).toBeInTheDocument();
  });

  it("renders an explanatory empty state when summary data lacks coverage", () => {
    mockUseAIImpactSummary.mockReturnValue({
      data: { aiImpactSummary: { orgId: "org", startDate: filter.startDate, endDate: filter.endDate, totalPrs: 0, aiAssistedPrs: 0, agentCreatedPrs: 0, humanPrs: 0, unknownPrs: 0, aiAssistedPrRatio: null, byBucket: [], daily: [], dataAvailable: false, computedAt: null } },
      fetching: false,
      error: undefined,
    });

    render(<AIImpactDashboard filter={filter} />);

    expect(screen.getByText("AI workflow data has not populated yet")).toBeInTheDocument();
    expect(screen.getByText(/Connect a GitHub provider/)).toBeInTheDocument();
  });

  it("renders populated dashboard panels from mocked data", () => {
    mockUseAIImpactSummary.mockReturnValue({
      data: {
        aiImpactSummary: {
          orgId: "org",
          startDate: filter.startDate,
          endDate: filter.endDate,
          totalPrs: 20,
          aiAssistedPrs: 8,
          agentCreatedPrs: 3,
          humanPrs: 10,
          unknownPrs: 2,
          aiAssistedPrRatio: 0.4,
          dataAvailable: true,
          computedAt: "2026-05-19T00:00:00Z",
          byBucket: [
            { bucket: "AI_ASSISTED", prsTotal: 5, prsMerged: 4, aiAssistedPrRatio: 0.25, agentCreatedPrCount: 0, cycleTimeAvgHours: 20, aiCycleTimeDeltaHours: -4, aiReviewAmplification: 0.5, reworkDragRate: 0.1, revertRate: 0.02, incidentDragRate: 0.01, testGapRate: 0.05, leverage: { prsComponent: 2, cycleTimeComponent: 1, reviewComponent: -0.5, reworkComponent: -0.2, testComponent: -0.1, incidentComponent: 0 } },
            { bucket: "AGENT_CREATED", prsTotal: 3, prsMerged: 3, aiAssistedPrRatio: 0.15, agentCreatedPrCount: 3, cycleTimeAvgHours: 18, aiCycleTimeDeltaHours: -6, aiReviewAmplification: 0.8, reworkDragRate: 0.2, revertRate: 0.03, incidentDragRate: 0.02, testGapRate: 0.08, leverage: { prsComponent: 1, cycleTimeComponent: 1, reviewComponent: -0.4, reworkComponent: -0.3, testComponent: -0.2, incidentComponent: -0.1 } },
            { bucket: "HUMAN", prsTotal: 10, prsMerged: 9, aiAssistedPrRatio: 0, agentCreatedPrCount: 0, cycleTimeAvgHours: 24, aiCycleTimeDeltaHours: null, aiReviewAmplification: null, reworkDragRate: 0.1, revertRate: 0.01, incidentDragRate: 0.01, testGapRate: 0.04, leverage: { prsComponent: 0, cycleTimeComponent: 0, reviewComponent: 0, reworkComponent: 0, testComponent: 0, incidentComponent: 0 } },
            { bucket: "UNKNOWN", prsTotal: 2, prsMerged: 2, aiAssistedPrRatio: null, agentCreatedPrCount: 0, cycleTimeAvgHours: null, aiCycleTimeDeltaHours: null, aiReviewAmplification: null, reworkDragRate: null, revertRate: null, incidentDragRate: null, testGapRate: null, leverage: { prsComponent: 0, cycleTimeComponent: 0, reviewComponent: 0, reworkComponent: 0, testComponent: 0, incidentComponent: 0 } },
          ],
          daily: [
            { bucket: "AGENT_CREATED", prsTotal: 1, prsMerged: 1, cycleTimeAvgHours: 10, reviewsPerPr: 2, changesRequestedPerPr: 1, reworkPrs: 0, reworkRate: 0, revertPrs: 0, revertRate: 0, incidentsCount: 0, incidentRate: 0, testGapPrs: 0, testGapRate: 0 },
            { bucket: "AGENT_CREATED", prsTotal: 2, prsMerged: 2, cycleTimeAvgHours: 12, reviewsPerPr: 2, changesRequestedPerPr: 1, reworkPrs: 1, reworkRate: 0.5, revertPrs: 0, revertRate: 0, incidentsCount: 0, incidentRate: 0, testGapPrs: 1, testGapRate: 0.5 },
          ],
        },
      },
      fetching: false,
      error: undefined,
    });

    render(<AIImpactDashboard filter={filter} />);

    expect(screen.getByTestId("ai-impact-dashboard")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByTestId("donut-chart")).toHaveTextContent("Ai Assisted");
    expect(screen.getByTestId("vertical-bar-chart")).toHaveTextContent("PR volume");
    expect(screen.getByText("Best-fit automation opportunities")).toBeInTheDocument();
  });
});
