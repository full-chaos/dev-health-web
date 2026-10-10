import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchRiskMetrics } = vi.hoisted(() => ({ mockFetchRiskMetrics: vi.fn() }));

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
    HorizontalBarChart: () => <div data-testid="horizontal-bar-chart" />,
}));
vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));

import RiskPage from "./page";

// CHAOS-9077: the three Delivery Risk tiles have no catalog key and no TestOps measure definition;
// the page states the direction of each at the tile.
const risk = (delta: number) => ({
    timeseries: [{ date: "2026-09-01", riskScore: 0.2 }],
    quality_drag_breakdown: [],
    quadrant_data: [],
    release_confidence: 0.8,
    quality_drag_hours: 12,
    pipeline_stability: 0.9,
    confidence_delta: delta,
    drag_delta: delta,
    stability_delta: delta,
});

describe("Delivery Risk tiles: tone of the change", () => {
    beforeEach(() => vi.clearAllMocks());

    // Release Confidence and Pipeline Stability: higher is better. Quality Drag (hours lost): lower is better.
    it.each([
        [-4, ["bad", "good", "bad"]],
        [4, ["good", "bad", "good"]],
    ] as const)(
        "draws a change of %s percent by the direction of each tile",
        async (delta, tones) => {
            mockFetchRiskMetrics.mockResolvedValue(risk(delta));
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            const deltas = within(screen.getByTestId("delivery-risk-tiles")).getAllByTestId(
                "metric-delta",
            );
            expect(deltas).toHaveLength(3);
            const cls = { good: "text-(--positive)", bad: "text-(--accent-negative)" };
            const other = { good: cls.bad, bad: cls.good };
            deltas.forEach((el, i) => {
                expect(el).toHaveClass(cls[tones[i]]);
                expect(el).not.toHaveClass(other[tones[i]]);
                expect(el.textContent).toBe(delta > 0 ? "+4%" : "-4%");
            });
        },
    );
});
