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
    MetricCard: ({
        label,
        value,
        spark,
    }: {
        label: string;
        value?: number;
        spark?: Array<{ ts: string; value: number | null }>;
    }) => (
        <article
            data-testid={`card-${label}`}
            data-value={value === undefined ? "undefined" : String(value)}
            data-spark={JSON.stringify(spark ?? null)}
        >
            {label}
        </article>
    ),
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
    // Missing is not zero: a null coverage bucket is never a 0 % card or a 0 point.
    const coverageSeries = (values: Array<number | null>) => ({
        timeseries: [
            {
                dimension: "TEAM",
                dimensionValue: "t",
                measure: "COVERAGE_LINE_PCT",
                buckets: values.map((value, i) => ({ date: `2026-06-0${i + 1}`, value })),
            },
        ],
        breakdowns: [],
    });
    const lineCard = () => screen.getByTestId("card-Line Coverage");

    it("a null latest bucket is no value on the card (not 0) and stays a gap in the spark", async () => {
        mockFetchCoverageMetrics.mockResolvedValue(coverageSeries([50, null]));
        render(await CoveragePage({ searchParams: Promise.resolve({}) }));
        expect(lineCard()).toHaveAttribute("data-value", "undefined");
        expect(JSON.parse(lineCard().getAttribute("data-spark") ?? "null")).toEqual([
            { ts: "2026-06-01", value: 50 },
            { ts: "2026-06-02", value: null },
        ]);
        expect(screen.getByTestId("coverage-chart-frame")).toHaveAttribute("data-is-empty", "false");
    });

    it("an all-null series is the not-populated state, not a flat 0 trend", async () => {
        mockFetchCoverageMetrics.mockResolvedValue(coverageSeries([null, null]));
        render(await CoveragePage({ searchParams: Promise.resolve({}) }));
        expect(lineCard()).toHaveAttribute("data-value", "undefined");
        expect(screen.getByTestId("coverage-chart-frame")).toHaveAttribute("data-is-empty", "true");
    });

    it("a produced 0 stays 0 on the card and is a populated trend", async () => {
        mockFetchCoverageMetrics.mockResolvedValue(coverageSeries([0]));
        render(await CoveragePage({ searchParams: Promise.resolve({}) }));
        expect(lineCard()).toHaveAttribute("data-value", "0");
        expect(screen.getByTestId("coverage-chart-frame")).toHaveAttribute("data-is-empty", "false");
    });
});
