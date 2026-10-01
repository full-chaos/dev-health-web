import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchRiskMetrics, quadrantProps } = vi.hoisted(() => ({
    mockFetchRiskMetrics: vi.fn(),
    quadrantProps: vi.fn(),
}));

vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchRiskMetrics: mockFetchRiskMetrics }));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({ label }: { label: string }) => <article>{label}</article>,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="horizontal-bar-chart" />,
}));
vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: (props: { data: { points: unknown[] } }) => {
        quadrantProps(props);
        return <div data-testid="quadrant-chart" data-points={props.data.points.length} />;
    },
}));

import RiskPage from "./page";

const risk = (quadrant_data: unknown[]) => ({
    timeseries: [{ date: "2026-09-01", riskScore: 0.2 }],
    quality_drag_breakdown: [{ category: "Retry Overhead", hours: 3 }],
    quadrant_data,
});

describe("Delivery Risk page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("titles the scatter after its axes and draws no zone overlay", async () => {
        mockFetchRiskMetrics.mockResolvedValue(
            risk([{ id: "repo-a", pipeline_success_rate: 0.9, test_pass_rate: 0.95 }]),
        );

        render(await RiskPage({ searchParams: Promise.resolve({}) }));

        expect(
            screen.getByRole("heading", { name: "Pipeline success × test pass rate (by repo)" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Risk vs Throughput (by Repo)")).toBeNull();
        const props = quadrantProps.mock.calls[0][0];
        expect(props.scopeType).toBe("repo");
        expect(props.showZoneOverlay).toBeUndefined();
    });

    it("drops repos without finite rates and keeps the empty state when none is left", async () => {
        mockFetchRiskMetrics.mockResolvedValue(
            risk([
                { id: "repo-a", pipeline_success_rate: 0.9, test_pass_rate: 0.95 },
                { id: "repo-b", pipeline_success_rate: 0.9 },
                { id: "repo-c", test_pass_rate: 0.5 },
            ]),
        );
        const first = render(await RiskPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
        first.unmount();

        mockFetchRiskMetrics.mockResolvedValue(
            risk([{ id: "repo-b", pipeline_success_rate: 0.9 }]),
        );
        render(await RiskPage({ searchParams: Promise.resolve({}) }));
        expect(screen.queryByTestId("quadrant-chart")).toBeNull();
        expect(screen.getByTestId("risk-throughput-empty")).toBeInTheDocument();
        expect(screen.getByText("No repo risk data for this window")).toBeInTheDocument();
    });
});
