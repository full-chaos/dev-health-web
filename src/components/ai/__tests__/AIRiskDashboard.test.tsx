import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIRiskDashboard } from "../AIRiskDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const { mockUseAIRiskBreakdown, mockUseAIGovernanceSummary } = vi.hoisted(() => ({
    mockUseAIRiskBreakdown: vi.fn(),
    mockUseAIGovernanceSummary: vi.fn(),
}));

// Stub the transitive urql/provider imports so importOriginal can load the
// real useAIReviewRisk module under vitest (same pattern as the adapters test).
vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }],
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));

// Mock ONLY the data hooks; everything else (findBucketRow, prViolationRows)
// must be the real implementation so this suite exercises the production
// bucket-normalization path (uppercase request vs lowercase rows, CHAOS-2225).
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/graphql/hooks/useAIReviewRisk")>();
    return {
        ...actual,
        useAIRiskBreakdown: mockUseAIRiskBreakdown,
        useAIGovernanceSummary: mockUseAIGovernanceSummary,
    };
});

const filter: AIFilter = { startDate: "2026-04-01", endDate: "2026-05-01" };

describe("AIRiskDashboard", () => {
    beforeEach(() => {
        mockUseAIRiskBreakdown.mockReset();
        mockUseAIGovernanceSummary.mockReset();
        mockUseAIGovernanceSummary.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
    });

    it("renders fetching state", () => {
        mockUseAIRiskBreakdown.mockReturnValue({
            data: undefined,
            fetching: true,
            error: undefined,
        });
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
                        {
                            key: "hotspot_overlap",
                            title: "Hotspot file overlap",
                            guidance: "Hotspot overlap needs changed-file coverage.",
                        },
                        {
                            key: "complexity_overlap",
                            title: "High-complexity file overlap",
                            guidance: "Complexity overlap needs file complexity coverage.",
                        },
                    ],
                    byBucket: [
                        {
                            bucket: "ai_assisted",
                            prsTotal: 10,
                            reworkPrs: 2,
                            reworkRate: 0.2,
                            revertPrs: 1,
                            revertRate: 0.1,
                            testGapPrs: 3,
                            testGapRate: 0.3,
                            incidentsCount: 1,
                            incidentRate: 0.1,
                        },
                    ],
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
                        reworkRate: 0.2,
                        revertRate: 0.1,
                        testGapRate: 0.3,
                        incidentRate: 0.1,
                    },
                    baselineSide: {
                        bucket: "human",
                        prsTotal: 10,
                        prsMerged: 8,
                        reworkRate: 0.1,
                        revertRate: 0.05,
                        testGapRate: 0.2,
                        incidentRate: 0.02,
                    },
                    delta: {
                        reworkRateDelta: 0.1,
                        revertRateDelta: 0.05,
                        testGapRateDelta: 0.1,
                        incidentRateDelta: 0.08,
                    },
                },
            },
        });
        mockUseAIGovernanceSummary.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiGovernanceSummary: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: true,
                    coverage: [],
                    recentViolations: [
                        {
                            ruleId: "scan",
                            severity: "medium",
                            subjectType: "pr",
                            subjectId: "44",
                            observedAt: "2026-05-01T00:00:00Z",
                            evidence: "Scan missing",
                        },
                    ],
                },
            },
        });

        render(<AIRiskDashboard filter={filter} />);
        expect(screen.getByText("Rework rate")).toBeInTheDocument();
        expect(screen.getByText("Hotspot file overlap")).toBeInTheDocument();
        expect(screen.getByText("PR 44")).toBeInTheDocument();
        expect(screen.getByTestId("ai-linked-incidents")).toHaveTextContent("1");
    });

    it("renders real overlap panels when rows exist — computed zero is a real 0%", () => {
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: true,
                    missingStates: [],
                    byBucket: [],
                    hotspotOverlap: [
                        {
                            bucket: "ai_assisted",
                            prsTotal: 44,
                            prsTouchingHotspots: 26,
                            hotspotOverlapRate: 0.59,
                            avgHotspotRiskScore: 1.48,
                        },
                    ],
                    complexityOverlap: [
                        {
                            bucket: "ai_assisted",
                            prsTotal: 44,
                            prsTouchingHighComplexity: 0,
                            complexityOverlapRate: 0,
                        },
                    ],
                },
            },
        });

        render(<AIRiskDashboard filter={filter} />);

        const hotspot = screen.getByTestId("ai-hotspot-overlap");
        expect(hotspot).toHaveTextContent("59%");
        expect(hotspot).toHaveTextContent("26 of 44 AI-attributed PRs");
        expect(hotspot).toHaveTextContent("avg risk score 1.48");
        expect(hotspot).toHaveTextContent("top-decile-risk files");

        // 0 of 44 is a computed REAL ZERO — renders as 0%, never as missing.
        const complexity = screen.getByTestId("ai-complexity-overlap");
        expect(complexity).toHaveTextContent("0%");
        expect(complexity).toHaveTextContent("0 of 44 AI-attributed PRs");

        expect(screen.queryByTestId("ai-hotspot-overlap-unavailable")).not.toBeInTheDocument();
        expect(screen.queryByTestId("ai-complexity-overlap-unavailable")).not.toBeInTheDocument();
    });

    it("falls back to the canonical DataState when overlap rows and missing-states are both absent", () => {
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: true,
                    missingStates: [],
                    byBucket: [],
                    hotspotOverlap: [],
                    complexityOverlap: [],
                },
            },
        });

        render(<AIRiskDashboard filter={filter} />);

        expect(screen.getByTestId("ai-hotspot-overlap-unavailable")).toBeInTheDocument();
        expect(screen.getByTestId("ai-complexity-overlap-unavailable")).toBeInTheDocument();
        expect(screen.queryByTestId("ai-hotspot-overlap")).not.toBeInTheDocument();
        expect(screen.queryByTestId("ai-complexity-overlap")).not.toBeInTheDocument();
    });

    it("renders data_available false empty state", () => {
        mockUseAIRiskBreakdown.mockReturnValue({
            fetching: false,
            error: undefined,
            data: {
                aiRiskBreakdown: {
                    orgId: "org",
                    startDate: "2026-04-01",
                    endDate: "2026-05-01",
                    dataAvailable: false,
                    byBucket: [],
                    missingStates: [],
                },
            },
        });
        render(<AIRiskDashboard filter={filter} />);
        expect(screen.getByText("AI risk data is not available")).toBeInTheDocument();
    });
});
