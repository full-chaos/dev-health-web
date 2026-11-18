import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchRiskMetrics, barProps } = vi.hoisted(() => ({
    mockFetchRiskMetrics: vi.fn(),
    barProps: vi.fn(),
}));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchRiskMetrics: mockFetchRiskMetrics }));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: (props: { categories: string[] }) => {
        barProps(props);
        return <div data-testid="horizontal-bar-chart" />;
    },
}));
vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));

import RiskPage from "./page";

// CHAOS-14001: a quality-drag sum that left out a part that was not measured says "partial" on its tile.
const risk = (extra: Record<string, unknown>) => ({
    timeseries: [{ date: "2026-09-01", riskScore: 0.2 }],
    quality_drag_breakdown: [{ category: "Retry Overhead", hours: 3 }],
    quadrant_data: [],
    release_confidence: 0.8,
    quality_drag_hours: 7,
    pipeline_stability: 0.9,
    ...extra,
});

const dragCaption = async () => {
    render(await RiskPage({ searchParams: Promise.resolve({}) }));
    return within(screen.getByTestId("delivery-risk-tiles")).getByText(
        /Hours lost to test\/pipeline issues/,
    );
};

describe("Delivery Risk: the Quality Drag tile and a partial sum", () => {
    beforeEach(() => vi.clearAllMocks());

    it("adds a partial mark to the tile caption when a summed part was not measured", async () => {
        mockFetchRiskMetrics.mockResolvedValue(risk({ quality_drag_partial: true }));
        expect((await dragCaption()).textContent).toBe(
            "Hours lost to test/pipeline issues · partial",
        );
    });

    it.each([[false], [undefined]])(
        "keeps the caption plain when partial is %s",
        async (partial) => {
            mockFetchRiskMetrics.mockResolvedValue(risk({ quality_drag_partial: partial }));
            expect((await dragCaption()).textContent).toBe("Hours lost to test/pipeline issues");
        },
    );

    it("draws no bar for a breakdown item the answer leaves out", async () => {
        mockFetchRiskMetrics.mockResolvedValue(risk({ quality_drag_partial: true }));
        await dragCaption();
        expect(barProps).toHaveBeenCalledWith(
            expect.objectContaining({ categories: ["Retry Overhead"] }),
        );
    });
});
