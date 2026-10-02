import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

const { mockSummary, mockComparison, donutProps } = vi.hoisted(() => ({
    mockSummary: vi.fn(),
    mockComparison: vi.fn(),
    donutProps: { last: null as null | { data: unknown[]; legendPercent?: boolean } },
}));

vi.mock("@/lib/graphql/hooks/useAIImpact", () => ({
    useAIImpactSummary: mockSummary,
    useAIComparison: mockComparison,
}));
vi.mock("@/components/charts/DonutChart", () => ({
    DonutChart: (props: { data: unknown[]; legendPercent?: boolean }) => {
        donutProps.last = props;
        return <div data-testid="donut-chart" />;
    },
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({ TimeseriesChart: () => <div /> }));
vi.mock("@/components/charts/VerticalBarChart", () => ({ VerticalBarChart: () => <div /> }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => <div /> }));

import { AIImpactDashboard } from "../AIImpactDashboard";

const summary = {
    totalPrs: 20,
    aiAssistedPrs: 8,
    agentCreatedPrs: 3,
    unknownPrs: 2,
    aiAssistedPrRatio: 0.4,
    dataAvailable: true,
    computedAt: "x",
    byBucket: [
        { bucket: "human", prsTotal: 10, agentCreatedPrCount: 0 },
        { bucket: "agent_created", prsTotal: 3, agentCreatedPrCount: 3 },
        { bucket: "ai_assisted", prsTotal: 5, agentCreatedPrCount: 0 },
        { bucket: "unknown", prsTotal: 2, agentCreatedPrCount: 0 },
    ],
    daily: [],
    repoBreakdown: [],
    teamBreakdown: [],
};

afterEach(cleanup);

const setup = () => {
    mockSummary.mockReturnValue({ data: { aiImpactSummary: summary }, fetching: false });
    mockComparison.mockReturnValue({ data: { aiComparison: undefined }, fetching: false });
};

describe("AI Impact page look (CHAOS-7768)", () => {
    it("the donut keeps one color per bucket whatever the order of the rows, and writes the share in the legend", () => {
        setup();
        render(<AIImpactDashboard filter={{ startDate: "a", endDate: "b" }} />);
        const data = donutProps.last?.data as Array<{
            name: string;
            colorIndex?: number;
            muted?: boolean;
        }>;
        const byName = Object.fromEntries(data.map((d) => [d.name, d]));
        expect(byName["Ai Assisted"].colorIndex).toBe(1);
        expect(byName["Agent Created"].colorIndex).toBe(6);
        expect(byName["Human"].muted).toBe(true);
        expect(byName["Unknown"].muted).toBe(true);
        expect(donutProps.last?.legendPercent).toBe(true);
    });

    it("the unknown-attribution tile is dashed; the other two are solid", () => {
        setup();
        render(<AIImpactDashboard filter={{ startDate: "a", endDate: "b" }} />);
        const tile = (label: string) => screen.getAllByText(label)[0].parentElement as HTMLElement;
        expect(tile("Unknown attribution").className).toContain("border-dashed");
        expect(tile("AI-assisted work share").className).not.toContain("border-dashed");
        expect(tile("Agent-created work share").className).not.toContain("border-dashed");
    });

    it("the automations card is an info notice with the link, not a live region", () => {
        setup();
        const { container } = render(
            <AIImpactDashboard filter={{ startDate: "a", endDate: "b" }} />,
        );
        const notice = container.querySelector("[data-notice-variant='info']") as HTMLElement;
        expect(notice).toHaveTextContent("Best-fit automation opportunities");
        expect(notice.querySelector("a")).toHaveAttribute("href", "/ai/automations");
        expect(screen.queryByRole("status")).toBeNull();
    });
});
