import { render, screen } from "@/test/utils";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckApiHealth, mockFetchCoverageMetrics } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchCoverageMetrics: vi.fn(),
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: mockCheckApiHealth,
}));

vi.mock("@/lib/testops/fetchers", () => ({
    fetchCoverageMetrics: mockFetchCoverageMetrics,
}));

vi.mock("@/lib/config", () => ({
    getServerEnv: () => ({}),
}));

vi.mock("@/lib/labels/entityLabel", () => ({
    resolveEntityLabels: (ids: string[]) => ({ labels: ids, titles: ids }),
}));

vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => <nav data-testid="primary-nav" />,
}));

vi.mock("@/components/navigation/GlobalContextBar", () => ({
    GlobalContextBar: () => <div data-testid="global-context" />,
}));

vi.mock("@/components/filters/FilterBar", () => ({
    FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/shared/BackLink", () => ({
    BackLink: () => <button type="button">Back</button>,
}));

vi.mock("../TestOpsTabs", () => ({
    TestOpsTabs: () => <div data-testid="testops-tabs" />,
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

vi.mock("@/components/charts/ChartFrame", () => ({
    ChartFrame: ({
        children,
        isError,
        isEmpty,
        stateMessage,
        stateDescription,
        stateTitle,
        title,
    }: {
        children: ReactNode;
        isError?: boolean;
        isEmpty?: boolean;
        stateMessage?: string;
        stateDescription?: string;
        stateTitle?: string;
        title: string;
    }) => (
        <section
            data-testid="coverage-chart-frame"
            data-is-error={String(Boolean(isError))}
            data-is-empty={String(Boolean(isEmpty))}
        >
            <h2>{title}</h2>
            {isError ? <p>{stateMessage}</p> : isEmpty ? <p>{stateDescription ?? stateTitle}</p> : children}
        </section>
    ),
}));

import CoveragePage from "./page";

describe("CoveragePage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckApiHealth.mockResolvedValue({ ok: true });
    });

    it("renders GraphQL fetch failures as an error state instead of empty coverage", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({ timeseries: [], breakdowns: [], fetchFailed: true });

        render(await CoveragePage({ searchParams: Promise.resolve({}) }));

        const chartFrame = screen.getByTestId("coverage-chart-frame");
        expect(chartFrame).toHaveAttribute("data-is-error", "true");
        expect(chartFrame).toHaveAttribute("data-is-empty", "true");
        expect(screen.getByText(/Coverage analytics could not be loaded/i)).toBeInTheDocument();
    });

    it("renders genuine empty coverage as a not-populated state", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({ timeseries: [], breakdowns: [] });

        render(await CoveragePage({ searchParams: Promise.resolve({}) }));

        const chartFrame = screen.getByTestId("coverage-chart-frame");
        expect(chartFrame).toHaveAttribute("data-is-error", "false");
        expect(chartFrame).toHaveAttribute("data-is-empty", "true");
        expect(screen.getByText(/connected CI coverage data is available/i)).toBeInTheDocument();
    });
});
