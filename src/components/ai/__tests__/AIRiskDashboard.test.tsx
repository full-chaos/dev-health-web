import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIRiskDashboard } from "../AIRiskDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIRiskBreakdown, mockUseAIGovernanceSummary } = vi.hoisted(() => ({
  mockUseAIRiskBreakdown: vi.fn(),
  mockUseAIGovernanceSummary: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async () => {
  return {
    useAIRiskBreakdown: mockUseAIRiskBreakdown,
    useAIGovernanceSummary: mockUseAIGovernanceSummary,
    findBucketRow: <T extends { bucket: string }>(rows: T[] | undefined, bucket = "AI_ASSISTED") => rows?.find((row) => row.bucket === bucket),
    prViolationRows: (summary?: { recentViolations?: Array<{ subjectType: string }> }) => (summary?.recentViolations ?? []).filter((violation) => violation.subjectType.toLowerCase() === "pr"),
  };
});

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

describe("AIRiskDashboard", () => {
  beforeEach(() => {
    mockUseAIRiskBreakdown.mockReset();
    mockUseAIGovernanceSummary.mockReset();
    mockUseAIGovernanceSummary.mockReturnValue({ data: undefined, fetching: false, error: undefined });
  });

  it("renders fetching state", () => {
    mockUseAIRiskBreakdown.mockReturnValue({ data: undefined, fetching: true, error: undefined });
    render(<AIRiskDashboard filter={filter} />);
    expect(screen.getAllByText("Loading baseline…").length).toBeGreaterThan(0);
  });

  it("renders populated risk cards, missing panels, and PR violations", () => {
    mockUseAIRiskBreakdown.mockReturnValue({
      fetching: false,
      error: undefined,
      data: {
        aiRiskBreakdown: {
          orgId: "org",
          startDate: "2026-04-01",
          endDate: "2026-05-01",
          dataAvailable: true,
          missingStates: [
            { key: "hotspot_overlap", title: "Hotspot file overlap", guidance: "Hotspot overlap needs changed-file coverage." },
            { key: "complexity_overlap", title: "High-complexity file overlap", guidance: "Complexity overlap needs file complexity coverage." },
          ],
          byBucket: [{ bucket: "AI_ASSISTED", prsTotal: 10, reworkPrs: 2, reworkRate: 0.2, revertPrs: 1, revertRate: 0.1, testGapPrs: 3, testGapRate: 0.3, incidentsCount: 1, incidentRate: 0.1 }],
        },
        aiComparison: {
          orgId: "org",
          startDate: "2026-04-01",
          endDate: "2026-05-01",
          dataAvailable: true,
          aiSide: { bucket: "AI_ASSISTED", prsTotal: 10, prsMerged: 8, reworkRate: 0.2, revertRate: 0.1, testGapRate: 0.3, incidentRate: 0.1 },
          baselineSide: { bucket: "HUMAN", prsTotal: 10, prsMerged: 8, reworkRate: 0.1, revertRate: 0.05, testGapRate: 0.2, incidentRate: 0.02 },
          delta: { reworkRateDelta: 0.1, revertRateDelta: 0.05, testGapRateDelta: 0.1, incidentRateDelta: 0.08 },
        },
      },
    });
    mockUseAIGovernanceSummary.mockReturnValue({
      fetching: false,
      error: undefined,
      data: { aiGovernanceSummary: { orgId: "org", startDate: "2026-04-01", endDate: "2026-05-01", dataAvailable: true, coverage: [], recentViolations: [{ ruleId: "scan", severity: "medium", subjectType: "pr", subjectId: "44", observedAt: "2026-05-01T00:00:00Z", evidence: "Scan missing" }] } },
    });

    render(<AIRiskDashboard filter={filter} />);
    expect(screen.getByText("Rework rate")).toBeInTheDocument();
    expect(screen.getByText("Hotspot file overlap")).toBeInTheDocument();
    expect(screen.getByText("PR 44")).toBeInTheDocument();
    expect(screen.getByTestId("ai-linked-incidents")).toHaveTextContent("1");
  });

  it("renders data_available false empty state", () => {
    mockUseAIRiskBreakdown.mockReturnValue({
      fetching: false,
      error: undefined,
      data: { aiRiskBreakdown: { orgId: "org", startDate: "2026-04-01", endDate: "2026-05-01", dataAvailable: false, byBucket: [], missingStates: [] } },
    });
    render(<AIRiskDashboard filter={filter} />);
    expect(screen.getByText("AI risk data is not available")).toBeInTheDocument();
  });
});
