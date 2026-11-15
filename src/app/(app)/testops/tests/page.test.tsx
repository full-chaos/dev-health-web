/** TestOps Tests page: the approved layout (4 tiles, Test trends with two charts, history notice). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, mockFetchTestWindow, chartSpy, heatmapSpy } =
    vi.hoisted(() => ({
        mockCheckApiHealth: vi.fn(),
        mockFetchTestOpsData: vi.fn(),
        mockFetchTestWindow: vi.fn(),
        chartSpy: vi.fn(),
        heatmapSpy: vi.fn(),
    }));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops/tests",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: mockFetchTestOpsData,
    fetchTestWindow: mockFetchTestWindow,
}));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: () => <div data-testid="scope-bar" />,
}));
vi.mock("../TestOpsTabs", () => ({
    TestOpsTabs: ({ activeId }: { activeId: string }) => (
        <div data-testid="testops-tabs" data-active={activeId} />
    ),
}));
// The header action opens the shared drawer with this subject; here its body is drawn in place.
vi.mock("@/components/shell/PageHeaderEvidenceAction", () => ({
    PageHeaderEvidenceAction: ({ subject }: { subject: { title: string; content: ReactNode } }) => (
        <div data-testid="page-evidence" data-title={subject.title}>
            {subject.content}
        </div>
    ),
}));
vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({
        label,
        value,
        caption,
        delta,
        deltaUnavailableLabel,
        valueText,
        deltaSlot,
    }: {
        label: string;
        value?: number;
        caption?: string;
        delta?: number;
        deltaUnavailableLabel?: string;
        valueText?: string;
        deltaSlot?: ReactNode;
    }) => (
        <article
            data-testid="metric-tile"
            data-label={label}
            data-value={value === undefined ? "undefined" : String(value)}
            data-caption={caption ?? ""}
            data-value-text={valueText ?? ""}
            data-has-delta-slot={deltaSlot === undefined ? "no" : "yes"}
            data-delta={delta === undefined ? "undefined" : String(delta)}
            data-no-delta-label={deltaUnavailableLabel}
        />
    ),
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="timeseries-chart" />;
    },
}));
vi.mock("@/components/charts/HeatmapChart", () => ({
    HeatmapChart: (props: unknown) => {
        heatmapSpy(props);
        return <div data-testid="heatmap-chart" />;
    },
}));

import TestsPage from "./page";

const ts = (measure: string, buckets: Array<[string, number | null]>) => ({
    dimension: "TEAM",
    dimensionValue: "all",
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

const empty = { timeseries: [], breakdowns: [] };

const served = {
    pipelines: empty,
    tests: {
        timeseries: [
            ts("TEST_PASS_RATE", [
                ["2026-09-01", 97],
                ["2026-09-02", null],
                ["2026-09-03", 98],
            ]),
            // One bucket only: no change value can be served ("Insufficient history").
            ts("TEST_FAILURE_RATE", [["2026-09-03", 0]]),
            ts("TEST_FLAKE_RATE", [["2026-09-03", 0]]),
            ts("TEST_SUITE_DURATION_P95", [
                ["2026-09-01", 5],
                ["2026-09-03", 8.9],
            ]),
        ],
        breakdowns: [
            {
                dimension: "TEAM",
                measure: "TEST_FLAKE_RATE",
                items: [{ key: "team-a", value: 2 }],
            },
        ],
    },
    coverage: empty,
};

// A low-coverage window as production reads: 1.2 % of completed runs report tests.
const windowOf = (over: Record<string, unknown> = {}) => ({
    sinceDate: "2026-09-01",
    untilDate: "2026-09-14",
    coverage: { completedRuns: 1000, runsWithTests: 12, sharePct: 1.2 },
    cases: { passed: 99984, failed: 5, skipped: 11, quarantined: 0, total: 100000 },
    passRatePct: 99.84,
    failureRatePct: 0.00011,
    flakeRatePct: 0,
    ...over,
});

async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await TestsPage({ searchParams: Promise.resolve(searchParams) }));
}

/** True when `a` comes before `b` in the document. */
const before = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiHealth.mockResolvedValue({ ok: true });
    mockFetchTestOpsData.mockResolvedValue(served);
    mockFetchTestWindow.mockResolvedValue(windowOf());
});
afterEach(cleanup);

describe("TestOps Tests page — approved layout", () => {
    it("orders the page: header, scope bar, tab row, partial notice, tiles, Test trends, then the secondary heatmap card", async () => {
        await renderPage();
        const order = [
            screen.getByRole("heading", { level: 1, name: "TestOps" }),
            screen.getByTestId("scope-bar"),
            screen.getByTestId("testops-tabs"),
            screen.getByTestId("testops-tests-partial-notice"),
            screen.getByTestId("testops-tests-tiles"),
            screen.getByTestId("testops-test-trends"),
            screen.getByTestId("testops-flaky-patterns"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        expect(screen.getByTestId("testops-tabs")).toHaveAttribute("data-active", "tests");
    });

    it("draws the window tiles from the served window answer, with the coverage beside the rates and no delta", async () => {
        await renderPage();
        const strip = screen.getByTestId("testops-tests-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        const tiles = within(strip).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Test coverage",
            "Pass Rate",
            "Failure Rate",
            "Flake Rate",
            "Skipped cases",
            "P95 Suite Duration",
        ]);
        // 99.84 is cut down, never rounded up to 100; a small failure rate is never shown as 0.
        expect(tiles.map((tile) => tile.getAttribute("data-value-text"))).toEqual([
            "1.2%",
            "99.8%",
            "<0.1%",
            "0%",
            "",
            "",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual([
            "12 of 1,000 completed runs report tests · partial",
            "of the 1.2% of completed runs that report tests",
            "of the 1.2% of completed runs that report tests",
            "of the 1.2% of completed runs that report tests",
            "not in the pass rate",
            "test execution",
        ]);
        // The five window tiles carry no change value and hide the default "No prior period" line;
        // the suite duration tile still reads its series.
        expect(tiles.map((tile) => tile.getAttribute("data-has-delta-slot"))).toEqual([
            "yes",
            "yes",
            "yes",
            "yes",
            "yes",
            "no",
        ]);
        expect(tiles.slice(0, 5).map((tile) => tile.getAttribute("data-delta"))).toEqual(
            Array(5).fill("undefined"),
        );
        expect(tiles[4]).toHaveAttribute("data-value", "11");
    });

    it("draws 'Test trends' as one card holding two charts: Pass rate and Suite duration", async () => {
        await renderPage();
        const trends = screen.getByTestId("testops-test-trends");
        expect(within(trends).getByRole("heading", { level: 2 })).toHaveTextContent("Test trends");
        expect(
            within(trends)
                .getAllByRole("heading", { level: 3 })
                .map((h) => h.textContent),
        ).toEqual(["Pass rate", "Suite duration"]);

        const pass = within(trends).getByTestId("testops-trend-pass-rate");
        const duration = within(trends).getByTestId("testops-trend-suite-duration");
        expect(within(pass).getByText("Percent")).toBeInTheDocument();
        expect(within(duration).getByText("P95 · minutes")).toBeInTheDocument();
        expect(within(pass).getAllByTestId("timeseries-chart")).toHaveLength(1);
        expect(within(duration).getAllByTestId("timeseries-chart")).toHaveLength(1);

        // The served points, in order; a null bucket stays a gap (never 0).
        expect(chartSpy.mock.calls.map(([props]) => props)).toEqual([
            {
                data: [
                    { day: "2026-09-01", value: 97 },
                    { day: "2026-09-02", value: null },
                    { day: "2026-09-03", value: 98 },
                ],
                valueFormat: "percent",
            },
            {
                data: [
                    { day: "2026-09-01", value: 5 },
                    { day: "2026-09-03", value: 8.9 },
                ],
                valueFormat: "number",
            },
        ]);
    });

    it("says the window is partial below 50 % of completed runs, and not at 50 % or above", async () => {
        await renderPage();
        expect(screen.getByTestId("testops-tests-partial-notice")).toHaveTextContent(
            "Partial coverage: the pass, failure and flake rates cover 12 of 1,000 completed runs",
        );
        cleanup();

        mockFetchTestWindow.mockResolvedValue(
            windowOf({ coverage: { completedRuns: 10000, runsWithTests: 4999, sharePct: 49.99 } }),
        );
        await renderPage();
        expect(screen.getByTestId("testops-tests-partial-notice")).toBeInTheDocument();
        expect(screen.getAllByTestId("metric-tile")[0].getAttribute("data-caption")).toContain(
            "partial",
        );
        cleanup();

        mockFetchTestWindow.mockResolvedValue(
            windowOf({ coverage: { completedRuns: 10000, runsWithTests: 5000, sharePct: 50 } }),
        );
        await renderPage();
        expect(screen.queryByTestId("testops-tests-partial-notice")).toBeNull();
        expect(screen.getAllByTestId("metric-tile")[0].getAttribute("data-caption")).not.toContain(
            "partial",
        );
    });

    it("never rounds a pass rate up to 100: only a served 100 reads 100", async () => {
        for (const [served100, text] of [
            [99.96, "99.9%"],
            [99.99989, "99.9%"],
            [99.84, "99.8%"],
            [100, "100%"],
            [0.04, "<0.1%"],
            [0, "0%"],
        ] as const) {
            mockFetchTestWindow.mockResolvedValue(windowOf({ passRatePct: served100 }));
            await renderPage();
            expect(screen.getAllByTestId("metric-tile")[1].getAttribute("data-value-text")).toBe(
                text,
            );
            cleanup();
        }
    });

    it("writes missing as not reported, never as 0 or as healthy: no completed run, no rate", async () => {
        mockFetchTestWindow.mockResolvedValue(
            windowOf({
                coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
                cases: { passed: 0, failed: 0, skipped: 0, quarantined: 0, total: 0 },
                passRatePct: null,
                failureRatePct: null,
                flakeRatePct: null,
            }),
        );
        await renderPage();
        const tiles = screen.getAllByTestId("metric-tile");
        expect(tiles.slice(0, 4).map((tile) => tile.getAttribute("data-value"))).toEqual(
            Array(4).fill("undefined"),
        );
        expect(tiles.slice(0, 4).map((tile) => tile.getAttribute("data-value-text"))).toEqual(
            Array(4).fill(""),
        );
        expect(tiles[0].getAttribute("data-caption")).toBe("No completed runs in this scope");
        expect(screen.queryByTestId("testops-tests-partial-notice")).toBeNull();
    });

    it("says the read failed, never a rate, when the window answer failed", async () => {
        mockFetchTestWindow.mockResolvedValue({ fetchFailed: true });
        await renderPage();
        const tiles = screen.getAllByTestId("metric-tile").slice(0, 5);
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual(
            Array(5).fill("undefined"),
        );
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual(
            Array(5).fill("Test window could not be loaded"),
        );
        expect(screen.queryByTestId("testops-tests-partial-notice")).toBeNull();
    });

    it("keeps 'Flaky Test Patterns' as a secondary card below, from the served breakdown", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-flaky-patterns");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Flaky Test Patterns",
        );
        const [batch] = mockFetchTestOpsData.mock.calls.at(-1) as [
            { breakdowns: Array<{ measure: string; topN: number }> },
        ];
        expect(batch.breakdowns).toEqual([
            expect.objectContaining({ measure: "TEST_FLAKE_RATE", topN: 10 }),
        ]);
    });

    const flakeItems = (items: Array<[string, number]>) => ({
        ...served,
        tests: {
            ...served.tests,
            breakdowns: [
                {
                    dimension: "TEAM",
                    measure: "TEST_FLAKE_RATE",
                    items: items.map(([key, value]) => ({ key, value })),
                },
            ],
        },
    });

    it("shows one to three flake groups as value rows, not as one huge heatmap block", async () => {
        mockFetchTestOpsData.mockResolvedValue(
            flakeItems([
                ["team-a", 0.08],
                ["None", 2],
            ]),
        );
        await renderPage();
        const card = screen.getByTestId("testops-flaky-patterns");
        expect(within(card).queryByTestId("heatmap-chart")).toBeNull();
        const rows = within(within(card).getByTestId("testops-flaky-rows")).getAllByTestId(
            "evidence-fact",
        );
        // A served small value is not shown as 0; a missing key reads "Unattributed".
        expect(rows.map((row) => row.textContent)).toEqual(["team-a0.1%", "Unattributed2%"]);
    });

    it("draws the heatmap, at a fixed short height, from four groups on", async () => {
        mockFetchTestOpsData.mockResolvedValue(
            flakeItems([
                ["a", 1],
                ["b", 2],
                ["c", 3],
                ["d", 4],
            ]),
        );
        await renderPage();
        const card = screen.getByTestId("testops-flaky-patterns");
        expect(within(card).getByTestId("heatmap-chart")).toBeInTheDocument();
        expect(within(card).queryByTestId("testops-flaky-rows")).toBeNull();
        expect(heatmapSpy.mock.calls.at(-1)?.[0]).toEqual({
            data: {
                axes: { x: ["a", "b", "c", "d"], y: ["Flake Rate"] },
                cells: [
                    { x: "a", y: "Flake Rate", value: 1 },
                    { x: "b", y: "Flake Rate", value: 2 },
                    { x: "c", y: "Flake Rate", value: 3 },
                    { x: "d", y: "Flake Rate", value: 4 },
                ],
                legend: { unit: "%", scale: "linear" },
            },
            height: 160,
        });
    });

    it("shows empty states, not empty charts, when nothing is served", async () => {
        mockFetchTestOpsData.mockResolvedValue({ pipelines: empty, tests: empty, coverage: empty });
        await renderPage();
        expect(screen.getByText("Pass rate not populated")).toBeInTheDocument();
        expect(screen.getByText("Suite duration not populated")).toBeInTheDocument();
        expect(screen.getByText("No flaky test patterns")).toBeInTheDocument();
        expect(screen.queryByTestId("timeseries-chart")).toBeNull();
        expect(screen.queryByTestId("heatmap-chart")).toBeNull();
    });

    it("treats a series with only null buckets as not populated (missing is not zero)", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            ...served,
            tests: {
                timeseries: [ts("TEST_PASS_RATE", [["2026-09-03", null]])],
                breakdowns: [],
            },
        });
        await renderPage();
        expect(screen.getByText("Pass rate not populated")).toBeInTheDocument();
    });

    it("shows errors, not empty states, when the request failed", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: empty,
            tests: empty,
            coverage: empty,
            fetchFailed: true,
        });
        await renderPage();
        expect(screen.getByText("Pass rate could not be loaded")).toBeInTheDocument();
        expect(screen.getByText("Suite duration could not be loaded")).toBeInTheDocument();
        expect(screen.getByText("Flaky test patterns could not be loaded")).toBeInTheDocument();
        expect(screen.queryByText("Pass rate not populated")).toBeNull();
        expect(screen.queryByText("No flaky test patterns")).toBeNull();
    });

    it("gives the header a 'View evidence' subject with the tiles' served values and definitions", async () => {
        await renderPage();
        const evidence = screen.getByTestId("page-evidence");
        expect(evidence).toHaveAttribute("data-title", "TestOps tests");
        const facts = within(within(evidence).getByTestId("testops-evidence-facts")).getAllByTestId(
            "evidence-fact",
        );
        // The drawer writes the tile's own text: the same cut-down pass rate, not a rounded one.
        expect(facts.map((fact) => fact.textContent)).toEqual([
            "Test coverage1.2%",
            "Pass Rate99.8%",
            "Failure Rate<0.1%",
            "Flake Rate0%",
            "Skipped cases11",
            "P95 Suite Duration8.9m",
        ]);
        expect(within(evidence).getByTestId("testops-evidence-definitions")).toHaveTextContent(
            "95th percentile of test suite execution time",
        );
    });
});

describe("TestsPage window scope", () => {
    const f = (filter: Record<string, unknown>) => ({
        f: Buffer.from(JSON.stringify(filter), "utf8").toString("base64url"),
    });
    const pick = (scope: Record<string, unknown>) =>
        f({ time: { range_days: 30 }, scope, who: {}, what: {}, why: {}, how: {} });

    it("sends no scope for the whole organization, over the page's window", async () => {
        await renderPage();
        expect(mockFetchTestWindow).toHaveBeenCalledTimes(1);
        const [input, isTestMode] = mockFetchTestWindow.mock.calls[0];
        expect(input.sinceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(input.untilDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect([input.repoIds, input.teamIds]).toEqual([null, null]);
        expect(isTestMode).toBe(false);
    });

    it("sends a team pick as teamIds and a repository pick as repoIds", async () => {
        await renderPage(pick({ level: "team", ids: ["t1"] }));
        expect(mockFetchTestWindow.mock.calls.at(-1)?.[0]).toMatchObject({
            repoIds: null,
            teamIds: ["t1"],
        });
        cleanup();
        await renderPage(pick({ level: "repo", ids: ["r1", "r2"] }));
        expect(mockFetchTestWindow.mock.calls.at(-1)?.[0]).toMatchObject({
            repoIds: ["r1", "r2"],
            teamIds: null,
        });
    });
});

describe("TestsPage org scope (CHAOS-8272)", () => {
    it("shows one plain sentence and makes no request when the session has no org", async () => {
        requireSessionMock.mockResolvedValue({ user: {} });
        mockFetchTestOpsData.mockClear();
        render(await TestsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
        expect(mockFetchTestOpsData).not.toHaveBeenCalled();
    });
});
