import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

const { mockSummary, mockComparison } = vi.hoisted(() => ({
    mockSummary: vi.fn(),
    mockComparison: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({
    useAIImpactSummary: mockSummary,
    useAIComparison: mockComparison,
}));
vi.mock("@/components/charts/DonutChart", () => ({
    DonutChart: ({ data }: { data: Array<{ name: string; value: number }> }) => (
        <div data-testid="donut-chart">{data.map((d) => `${d.name}:${d.value}`).join(",")}</div>
    ),
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: ({ data }: { data: Array<{ day: string; value: number }> }) => (
        <div data-testid="timeseries-chart">{data.map((d) => `${d.day}=${d.value}`).join(",")}</div>
    ),
}));
vi.mock("@/components/charts/VerticalBarChart", () => ({
    VerticalBarChart: ({ categories }: { categories: string[] }) => (
        <div data-testid="vertical-bar-chart">{categories.join(",")}</div>
    ),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline-chart" />,
}));

import { AIImpactDashboard } from "../AIImpactDashboard";

// Pin tests for the Impact page (CHAOS-7768): green on the code before the restyle, kept green after.

const filter = { startDate: "2026-04-20", endDate: "2026-05-19" };

const summary = {
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
        {
            bucket: "ai_assisted",
            prsTotal: 5,
            agentCreatedPrCount: 0,
            leverage: {
                prsComponent: 2,
                cycleTimeComponent: 1,
                reviewComponent: -0.5,
                reworkComponent: -0.2,
                testComponent: -0.1,
                incidentComponent: 0,
            },
        },
        { bucket: "agent_created", prsTotal: 3, agentCreatedPrCount: 3 },
        { bucket: "human", prsTotal: 10, agentCreatedPrCount: 0 },
        { bucket: "unknown", prsTotal: 2, agentCreatedPrCount: 0 },
    ],
    daily: [
        { bucket: "agent_created", prsTotal: 1 },
        { bucket: "agent_created", prsTotal: 2 },
        { bucket: "human", prsTotal: 9 },
    ],
    repoBreakdown: [],
    teamBreakdown: [],
};

const comparison = {
    dataAvailable: true,
    aiSide: {
        reviewsPerPr: 2.4,
        reworkRate: 0.2,
        testGapRate: 0.1,
        revertRate: 0.05,
        incidentRate: 0.02,
    },
    baselineSide: {
        reviewsPerPr: 1.8,
        reworkRate: 0.1,
        testGapRate: 0.05,
        revertRate: 0.01,
        incidentRate: 0.01,
    },
    delta: {
        reviewsPerPrDelta: 0.6,
        reworkRateDelta: 10,
        testGapRateDelta: 5,
        revertRateDelta: 4,
        incidentRateDelta: 1,
    },
};

const setup = (s: unknown = summary, c: unknown = comparison) => {
    mockSummary.mockReturnValue({
        data: { aiImpactSummary: s },
        fetching: false,
        error: undefined,
    });
    mockComparison.mockReturnValue({
        data: { aiComparison: c },
        fetching: false,
        error: undefined,
    });
};

afterEach(cleanup);

describe("AI Impact page pinned (CHAOS-7768)", () => {
    it("has the three stat tiles with their labels, values and caption lines", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        const root = screen.getByTestId("ai-impact-dashboard");
        expect(root).toHaveTextContent("AI-assisted work share");
        expect(root).toHaveTextContent("40.0%");
        expect(root).toHaveTextContent("8 of 20 PRs lean AI-assisted.");
        expect(root).toHaveTextContent("Agent-created work share");
        expect(root).toHaveTextContent("15.0% of PRs appear agent-created.");
        expect(root).toHaveTextContent("Unknown attribution");
        expect(root).toHaveTextContent("Kept visible so data coverage gaps stay inspectable.");
    });

    it("has the panels in this order, each as an h2 (the automations card is a notice)", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
        expect(titles).toEqual([
            "AI-assisted work share",
            "Agent-created work share",
            "Net delivery lift",
            "Review amplification",
            "Rework drag",
            "Test gap rate",
            "Revert + incident drag",
            "Top affected repos and teams",
        ]);
        // The automations panel is an info notice now (M12): same words, link and place at the end.
        expect(screen.getByText("Best-fit automation opportunities")).toBeInTheDocument();
    });

    it("draws the donut from the bucket counts, the trend from the agent-created days, the six lift bars", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByTestId("donut-chart")).toHaveTextContent("Ai Assisted:5");
        expect(screen.getByTestId("donut-chart")).toHaveTextContent("Human:10");
        expect(screen.getByTestId("timeseries-chart")).toHaveTextContent("1=1,2=2");
        expect(screen.getByTestId("vertical-bar-chart")).toHaveTextContent(
            "PR volume,Cycle,Review,Rework,Test,Incident",
        );
    });

    it("keeps the six comparison cards and the lift note", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        for (const label of [
            "Reviews per PR",
            "Rework rate",
            "Test gap rate",
            "Revert rate",
            "Incident rate",
        ]) {
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        }
        expect(
            screen.getByText(/Positive bars suggest lift; negative bars suggest drag/),
        ).toBeInTheDocument();
    });

    it("links to the automations page and keeps the moved-candidates sentence", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByRole("link", { name: /See AI Automations/ })).toHaveAttribute(
            "href",
            "/ai/automations",
        );
        expect(
            screen.getByText(/Automation candidates moved out of the Impact dashboard/),
        ).toBeInTheDocument();
    });

    it("keeps the footer: last computed time and the system-health sentence", () => {
        setup();
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByText(/Last computed 2026-05-19T00:00:00Z\./)).toBeInTheDocument();
        expect(
            screen.getByText(
                /values suggest patterns and should be interpreted with local context/,
            ),
        ).toBeInTheDocument();
    });

    it("keeps the evidence link and the rollup rows (repos and teams), top five, with PR counts", () => {
        const rows = (p: string) =>
            Array.from({ length: 7 }, (_, i) => ({
                scopeId: `${p}${i}`,
                scopeLabel: `${p} ${i}`,
                aiPrsTotal: 10 - i,
                aiAssistedPrRatio: 0.5,
            }));
        setup({ ...summary, repoBreakdown: rows("repo"), teamBreakdown: rows("team") });
        render(<AIImpactDashboard filter={filter} evidenceHref="/ai/impact/evidence?f=x" />);
        expect(screen.getAllByTestId("ai-impact-rollup-row")).toHaveLength(10);
        expect(screen.getByRole("link", { name: /Open evidence/ })).toHaveAttribute(
            "href",
            "/ai/impact/evidence?f=x",
        );
    });

    it("states: loading skeleton, error panel, not populated", () => {
        mockSummary.mockReturnValue({ data: undefined, fetching: true, error: undefined });
        mockComparison.mockReturnValue({ data: undefined, fetching: true, error: undefined });
        const loading = render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByTestId("ai-impact-loading")).toBeInTheDocument();
        loading.unmount();
        mockSummary.mockReturnValue({ data: undefined, fetching: false, error: new Error("boom") });
        const err = render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByText("AI impact data could not load")).toBeInTheDocument();
        err.unmount();
        setup({ ...summary, dataAvailable: false });
        render(<AIImpactDashboard filter={filter} />);
        expect(screen.getByText("AI workflow data has not populated yet")).toBeInTheDocument();
    });
});
