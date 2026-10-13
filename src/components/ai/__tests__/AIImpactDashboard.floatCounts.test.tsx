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
    DonutChart: ({ data }: { data: Array<{ name: string; value: number }> }) => (
        <div data-testid="donut-chart">{data.map((item) => item.name).join(",")}</div>
    ),
}));

vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: ({ data }: { data: Array<{ day: string; value: number }> }) => (
        <div data-testid="timeseries-chart">{data.length}</div>
    ),
}));

vi.mock("@/components/charts/VerticalBarChart", () => ({
    VerticalBarChart: ({ categories }: { categories: string[] }) => (
        <div data-testid="vertical-bar-chart">{categories.join(",")}</div>
    ),
}));

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: ({ data }: { data: number[] }) => (
        <div data-testid="sparkline-chart">{data.join(",")}</div>
    ),
}));

import { AIImpactDashboard } from "../AIImpactDashboard";
import type { AIFilter } from "@/lib/filters/ai";

const filter: AIFilter = { startDate: "2026-04-20", endDate: "2026-05-19" };

const lev = { prsComponent: 1 };
function summary(counts: {
    totalPrs: number;
    aiAssistedPrs: number;
    agentCreatedPrs: number;
    aiPrsTotal: number;
    agentTotal: number;
}) {
    return {
        data: {
            aiImpactSummary: {
                orgId: "org",
                startDate: filter.startDate,
                endDate: filter.endDate,
                totalPrs: counts.totalPrs,
                aiAssistedPrs: counts.aiAssistedPrs,
                agentCreatedPrs: counts.agentCreatedPrs,
                humanPrs: 1,
                unknownPrs: 1,
                aiAssistedPrRatio: 0.4,
                dataAvailable: true,
                computedAt: "2026-05-19T00:00:00Z",
                byBucket: [
                    {
                        bucket: "agent_created",
                        prsTotal: counts.agentTotal,
                        prsMerged: counts.agentTotal,
                        agentCreatedPrCount: counts.agentTotal,
                        leverage: lev,
                    },
                ],
                daily: [
                    { bucket: "agent_created", day: "2026-05-01", prsTotal: counts.agentTotal },
                    { bucket: "agent_created", day: "2026-05-02", prsTotal: 2.25 },
                ],
                repoBreakdown: [
                    { scopeId: "r1", scopeLabel: "web-app", aiPrsTotal: counts.aiPrsTotal },
                ],
                teamBreakdown: [],
                missingStates: [],
            },
        },
        fetching: false,
        error: undefined,
    };
}

describe("AIImpactDashboard share-weighted counts (CHAOS-9605)", () => {
    beforeEach(() => {
        mockUseAIImpactSummary.mockReset();
        mockUseAIComparison.mockReset();
        mockUseAIOpportunities.mockReset();
        mockUseAIOpportunities.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
        mockUseAIComparison.mockReturnValue({ data: undefined, fetching: false, error: undefined });
    });
    afterEach(() => cleanup());

    it("prints a fractional count with one decimal", () => {
        mockUseAIImpactSummary.mockReturnValue(
            summary({
                totalPrs: 20.25,
                aiAssistedPrs: 8.5,
                agentCreatedPrs: 3.25,
                aiPrsTotal: 6.75,
                agentTotal: 3.25,
            }),
        );
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByText(/8\.5 of 20\.3 PRs lean AI-assisted/)).toBeInTheDocument();
        expect(screen.getByText(/6\.8 PRs/)).toBeInTheDocument();
        expect(screen.getAllByText("3.3").length).toBeGreaterThan(0);
    });

    it("prints a whole count as before, with no decimal", () => {
        mockUseAIImpactSummary.mockReturnValue(
            summary({
                totalPrs: 1200,
                aiAssistedPrs: 8,
                agentCreatedPrs: 3,
                aiPrsTotal: 6,
                agentTotal: 3,
            }),
        );
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByText(/8 of 1200 PRs lean AI-assisted/)).toBeInTheDocument();
        expect(screen.getByText(/6 PRs/)).toBeInTheDocument();
        expect(screen.queryByText(/\.0\b/)).not.toBeInTheDocument();
    });
});
