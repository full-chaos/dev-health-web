/** TestOps Tests page: the approved layout (4 tiles, Test trends with two charts, history notice). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, chartSpy, heatmapSpy } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchTestOpsData: vi.fn(),
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
vi.mock("@/lib/testops/fetchers", () => ({ fetchTestOpsData: mockFetchTestOpsData }));
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
    }: {
        label: string;
        value?: number;
        caption?: string;
        delta?: number;
        deltaUnavailableLabel?: string;
    }) => (
        <article
            data-testid="metric-tile"
            data-label={label}
            data-value={value === undefined ? "undefined" : String(value)}
            data-caption={caption ?? ""}
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
});
afterEach(cleanup);

describe("TestOps Tests page — approved layout", () => {
    it("orders the page: header, scope bar, tab row, tiles, Test trends, notice, then the secondary heatmap card", async () => {
        await renderPage();
        const order = [
            screen.getByRole("heading", { level: 1, name: "TestOps" }),
            screen.getByTestId("scope-bar"),
            screen.getByTestId("testops-tabs"),
            screen.getByTestId("testops-tests-tiles"),
            screen.getByTestId("testops-test-trends"),
            screen.getByTestId("testops-tests-history-notice"),
            screen.getByTestId("testops-flaky-patterns"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        expect(screen.getByTestId("testops-tabs")).toHaveAttribute("data-active", "tests");
    });

    it("draws the four test tiles as one 4-column strip, with served values and the short notes", async () => {
        await renderPage();
        const strip = screen.getByTestId("testops-tests-tiles");
        expect(strip).toHaveAttribute("data-columns", "4");
        const tiles = within(strip).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Pass Rate",
            "Failure Rate",
            "Flake Rate",
            "P95 Suite Duration",
        ]);
        // A served 0 is 0.
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual([
            "98",
            "0",
            "0",
            "8.9",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual([
            "tests passed",
            "",
            "",
            "test execution",
        ]);
        expect(tiles[1]).toHaveAttribute("data-delta", "undefined");
        expect(tiles[1]).toHaveAttribute("data-no-delta-label", "Insufficient history");
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

    it("names the rates with no served change in a notice: missing history is not a failure-free period", async () => {
        await renderPage();
        const notice = screen.getByTestId("testops-tests-history-notice");
        expect(notice).toHaveTextContent(
            "Failure Rate and Flake Rate show insufficient history in this window; they do not establish a proven failure-free period.",
        );
    });

    it("names only the rate that has no change value, and shows no notice when both have one", async () => {
        const withHistory = (failure: boolean, flake: boolean) => ({
            ...served,
            tests: {
                ...served.tests,
                timeseries: [
                    ts("TEST_PASS_RATE", [["2026-09-03", 98]]),
                    ts(
                        "TEST_FAILURE_RATE",
                        failure
                            ? [
                                  ["2026-09-01", 2],
                                  ["2026-09-03", 1],
                              ]
                            : [["2026-09-03", 1]],
                    ),
                    ts(
                        "TEST_FLAKE_RATE",
                        flake
                            ? [
                                  ["2026-09-01", 4],
                                  ["2026-09-03", 1],
                              ]
                            : [["2026-09-03", 1]],
                    ),
                ],
            },
        });

        mockFetchTestOpsData.mockResolvedValue(withHistory(true, false));
        await renderPage();
        expect(screen.getByTestId("testops-tests-history-notice")).toHaveTextContent(
            "Flake Rate shows insufficient history in this window; it does not establish a proven failure-free period.",
        );
        cleanup();

        mockFetchTestOpsData.mockResolvedValue(withHistory(true, true));
        await renderPage();
        expect(screen.queryByTestId("testops-tests-history-notice")).toBeNull();
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
        expect(facts.map((fact) => fact.textContent)).toEqual([
            "Pass Rate98%",
            "Failure Rate0%",
            "Flake Rate0%",
            "P95 Suite Duration8.9m",
        ]);
        expect(within(evidence).getByTestId("testops-evidence-definitions")).toHaveTextContent(
            "95th percentile of test suite execution time",
        );
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
