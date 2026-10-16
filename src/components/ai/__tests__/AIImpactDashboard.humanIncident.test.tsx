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
        <div data-testid="donut-chart">{data.map((i) => `${i.name}=${i.value}`).join(",")}</div>
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
        <div data-testid="sparkline-chart">{JSON.stringify(data)}</div>
    ),
}));

import { AIImpactDashboard } from "../AIImpactDashboard";
import { agentCreatedTrend, assistedWorkShareRows } from "../utils";
import type { AIFilter } from "@/lib/filters/ai";

const filter: AIFilter = { startDate: "2026-04-20", endDate: "2026-05-19" };

// CHAOS-9915: ops writes a `human` bucket row on work type "incident" with
// prs_total 0 and incidents_count > 0, and the AI comparison gets a human baseline.
const incidentHumanRow = {
    bucket: "human",
    prsTotal: 0,
    prsMerged: 0,
    incidentsCount: 3,
    incidentDragRate: null,
    leverage: null,
};
const aiRow = {
    bucket: "ai_assisted",
    prsTotal: 4,
    prsMerged: 4,
    incidentsCount: 0,
    leverage: { prsComponent: 1 },
};

function summary(byBucket: unknown[]) {
    return {
        data: {
            aiImpactSummary: {
                orgId: "org",
                startDate: filter.startDate,
                endDate: filter.endDate,
                totalPrs: 4,
                aiAssistedPrs: 4,
                agentCreatedPrs: 0,
                humanPrs: 0,
                unknownPrs: 0,
                aiAssistedPrRatio: 1,
                dataAvailable: true,
                computedAt: "2026-05-19T00:00:00Z",
                byBucket,
                daily: [
                    { bucket: "human", day: "2026-05-01", prsTotal: 0 },
                    { bucket: "ai_assisted", day: "2026-05-01", prsTotal: 4 },
                ],
                repoBreakdown: [],
                teamBreakdown: [],
                missingStates: [],
            },
        },
        fetching: false,
        error: undefined,
    };
}

function comparison(baselineSide: unknown) {
    return {
        data: {
            aiComparison: {
                aiSide: {
                    bucket: "ai_assisted",
                    prsTotal: 4,
                    prsMerged: 4,
                    reviewsPerPr: 2,
                    reworkRate: 0.1,
                    testGapRate: 0.1,
                    revertRate: 0,
                    incidentRate: 0,
                },
                baselineSide,
                delta: {
                    reviewsPerPrDelta: null,
                    reworkRateDelta: null,
                    testGapRateDelta: null,
                    revertRateDelta: null,
                    incidentRateDelta: null,
                },
            },
        },
        fetching: false,
        error: undefined,
    };
}

function expectCleanText() {
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
}

describe("AI impact with human-bucket and incident work-type rows (CHAOS-9915)", () => {
    beforeEach(() => {
        mockUseAIImpactSummary.mockReset();
        mockUseAIComparison.mockReset();
        mockUseAIOpportunities.mockReset();
        mockUseAIOpportunities.mockReturnValue({
            data: undefined,
            fetching: false,
            error: undefined,
        });
    });
    afterEach(() => cleanup());

    it("renders a human prs_total 0 / incidents 3 row beside an AI row with no NaN", () => {
        mockUseAIImpactSummary.mockReturnValue(summary([aiRow, incidentHumanRow]));
        mockUseAIComparison.mockReturnValue(
            comparison({
                bucket: "human",
                prsTotal: 0,
                prsMerged: 0,
                reviewsPerPr: null,
                reworkRate: null,
                testGapRate: null,
                revertRate: null,
                incidentRate: null,
            }),
        );
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByTestId("donut-chart")).toHaveTextContent("Human=0");
        expectCleanText();
    });

    it("renders when the human incident row comes first and carries no leverage", () => {
        mockUseAIImpactSummary.mockReturnValue(summary([incidentHumanRow, aiRow]));
        mockUseAIComparison.mockReturnValue(comparison(null));
        render(<AIImpactDashboard filter={filter} />);
        expectCleanText();
    });

    it("renders when the human incident row is the only bucket row", () => {
        mockUseAIImpactSummary.mockReturnValue(summary([incidentHumanRow]));
        mockUseAIComparison.mockReturnValue(comparison(null));
        render(<AIImpactDashboard filter={filter} />);
        expectCleanText();
    });

    it("keeps a human zero-PR row out of the agent trend and labels it Human in the share", () => {
        const rows = [incidentHumanRow] as never;
        expect(assistedWorkShareRows(rows)).toEqual([
            expect.objectContaining({ name: "Human", value: 0 }),
        ]);
        expect(
            agentCreatedTrend([{ bucket: "human", day: "2026-05-01", prsTotal: 0 }] as never),
        ).toEqual([]);
    });
});
