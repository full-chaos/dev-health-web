/**
 * CHAOS-9077: the TestOps Coverage tiles serve no change value and pass no direction, so they draw
 * no tone today. A rise and a fall of the served series must still draw no change element.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchCoverageMetrics } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchCoverageMetrics: vi.fn(),
}));

vi.mock("@/lib/api/filterOptions", () => ({ fetchTeamNames: vi.fn().mockResolvedValue({}) }));
const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchCoverageMetrics: mockFetchCoverageMetrics,
    fetchCoverageBaselines: vi.fn().mockResolvedValue([]),
    fetchCoverageScopeBaseline: vi.fn().mockResolvedValue({ lineBaselinePct: null, lineDays: 0 }),
}));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));
vi.mock("@/lib/labels/entityLabel", () => ({
    resolveEntityLabels: (ids: string[]) => ({ labels: ids, titles: ids }),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops/coverage",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/shell/PageHeaderEvidenceAction", () => ({
    PageHeaderEvidenceAction: () => <div />,
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("../TestOpsTabs", () => ({ TestOpsTabs: () => <div /> }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/charts/TimeseriesChart", () => ({ TimeseriesChart: () => <div /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));

import CoveragePage from "./page";

beforeEach(() => {
    requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } });
    mockCheckApiHealth.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const served = (first: number, last: number) => ({
    timeseries: [
        {
            dimension: "TEAM",
            dimensionValue: "t",
            measure: "COVERAGE_LINE_PCT",
            buckets: [
                { date: "2026-06-01", value: first },
                { date: "2026-06-02", value: last },
            ],
        },
    ],
    breakdowns: [],
});

describe("TestOps Coverage tile change tone", () => {
    it.each([
        ["rising", 50, 60],
        ["falling", 60, 50],
    ])("a %s line coverage draws no tone", async (_name, first, last) => {
        mockFetchCoverageMetrics.mockResolvedValue(served(first, last));
        render(await CoveragePage({ searchParams: Promise.resolve({}) }));
        const strip = screen.getByTestId("testops-coverage-tiles");
        expect(within(strip).getByText("Line Coverage")).toBeInTheDocument();
        expect(within(strip).queryByTestId("metric-delta")).toBeNull();
        expect(strip.innerHTML).not.toContain("text-(--positive)");
        expect(strip.innerHTML).not.toContain("text-(--accent-negative)");
    });
});
