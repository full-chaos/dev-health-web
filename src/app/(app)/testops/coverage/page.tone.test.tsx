/**
 * The TestOps Coverage tiles show the change of their own served series in percentage points: the
 * last bucket minus the first bucket that holds a value, "since" that first served day, toned by the
 * measure's direction (CHAOS-9077 polarity). The Coverage Delta tile shows no change. Every tile with
 * fewer than 2 valued buckets reads "No prior period".
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

const YEAR = new Date().getUTCFullYear();
const day = (monthDay: string) => `${YEAR}-${monthDay}`;

type Bucket = { date: string; value: number | null };
const series = (measure: string, buckets: Bucket[]) => ({
    dimension: "TEAM",
    dimensionValue: "t",
    measure,
    buckets,
});
const served = (...timeseries: ReturnType<typeof series>[]) => ({ timeseries, breakdowns: [] });

async function renderStrip(...timeseries: ReturnType<typeof series>[]) {
    mockFetchCoverageMetrics.mockResolvedValue(served(...timeseries));
    render(await CoveragePage({ searchParams: Promise.resolve({}) }));
    return screen.getByTestId("testops-coverage-tiles");
}

describe("TestOps Coverage tile change", () => {
    it.each([
        ["rising", 50, 60, "+10.0 pts since Jun 1", "text-(--positive)"],
        ["falling", 60, 50, "-10.0 pts since Jun 1", "text-(--accent-negative)"],
    ])("a %s line coverage shows the point change and its tone", async (_name, first, last, text, tone) => {
        const strip = await renderStrip(
            series("COVERAGE_LINE_PCT", [
                { date: day("06-01"), value: first },
                { date: day("06-02"), value: last },
            ]),
        );
        expect(within(strip).getByText("Line Coverage")).toBeInTheDocument();
        const change = within(strip).getByTestId("metric-delta");
        expect(change).toHaveTextContent(text);
        expect(change.className).toContain(tone);
    });

    it("a flat series shows 0.0 pts with no tone", async () => {
        const strip = await renderStrip(
            series("COVERAGE_BRANCH_PCT", [
                { date: day("06-01"), value: 48 },
                { date: day("06-14"), value: 48 },
            ]),
        );
        const change = within(strip).getByTestId("metric-delta");
        expect(change).toHaveTextContent("0.0 pts since Jun 1");
        expect(strip.innerHTML).not.toContain("text-(--positive)");
        expect(strip.innerHTML).not.toContain("text-(--accent-negative)");
    });

    it("a partial window counts from its first served day with a value, not the window start", async () => {
        const strip = await renderStrip(
            series("COVERAGE_LINE_PCT", [
                { date: day("06-01"), value: null },
                { date: day("06-06"), value: 60 },
                { date: day("06-14"), value: 62.8 },
            ]),
        );
        expect(within(strip).getByTestId("metric-delta")).toHaveTextContent("+2.8 pts since Jun 6");
    });

    it("fewer than 2 valued buckets read No prior period on every tile", async () => {
        const strip = await renderStrip(
            series("COVERAGE_LINE_PCT", [{ date: day("06-01"), value: 60 }]),
            series("COVERAGE_BRANCH_PCT", [
                { date: day("06-01"), value: null },
                { date: day("06-02"), value: 48 },
            ]),
            series("COVERAGE_DELTA_PCT", [{ date: day("06-01"), value: 0.4 }]),
        );
        expect(within(strip).queryByTestId("metric-delta")).toBeNull();
        expect(within(strip).getAllByText("No prior period")).toHaveLength(3);
    });

    it("a latest bucket with no value shows no change", async () => {
        const strip = await renderStrip(
            series("COVERAGE_LINE_PCT", [
                { date: day("06-01"), value: 60 },
                { date: day("06-02"), value: null },
            ]),
        );
        expect(within(strip).queryByTestId("metric-delta")).toBeNull();
    });

    it("the Coverage Delta tile with 2 buckets shows no change and no No prior period", async () => {
        const strip = await renderStrip(
            series("COVERAGE_DELTA_PCT", [
                { date: day("06-01"), value: 0.4 },
                { date: day("06-14"), value: 1.1 },
            ]),
        );
        expect(within(strip).queryByTestId("metric-delta")).toBeNull();
        // Only the two tiles with no series read it; the Coverage Delta tile does not.
        expect(within(strip).getAllByText("No prior period")).toHaveLength(2);
        expect(strip.innerHTML).not.toContain(" pts since ");
    });
});
