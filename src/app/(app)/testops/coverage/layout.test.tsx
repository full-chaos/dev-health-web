/** TestOps Coverage page: the approved layout (3 tiles, Coverage against baseline, Repository coverage table). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const {
    mockCheckApiHealth,
    mockFetchCoverageMetrics,
    mockFetchCoverageBaselines,
    mockFetchCoverageScopeBaseline,
    timeseriesSpy,
} = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchCoverageMetrics: vi.fn(),
    mockFetchCoverageBaselines: vi.fn(),
    mockFetchCoverageScopeBaseline: vi.fn(),
    timeseriesSpy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops/coverage",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchCoverageMetrics: mockFetchCoverageMetrics,
    fetchCoverageBaselines: mockFetchCoverageBaselines,
    fetchCoverageScopeBaseline: mockFetchCoverageScopeBaseline,
}));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));
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
        spark,
        hideTrend,
        caption,
    }: {
        label: string;
        value?: number;
        spark?: unknown[];
        hideTrend?: boolean;
        caption?: string;
    }) => (
        <article
            data-testid="metric-tile"
            data-label={label}
            data-value={value === undefined ? "undefined" : String(value)}
            data-spark-points={spark ? String(spark.length) : "none"}
            data-hide-trend={String(Boolean(hideTrend))}
            data-caption={caption ?? ""}
        />
    ),
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: (props: unknown) => {
        timeseriesSpy(props);
        return <div data-testid="timeseries-chart" />;
    },
}));

import CoveragePage from "./page";

const ts = (measure: string, buckets: Array<[string, number | null]>, dimensionValue = "t") => ({
    dimension: "TEAM",
    dimensionValue,
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

const served = {
    timeseries: [
        ts("COVERAGE_LINE_PCT", [
            ["2026-09-01", 59],
            ["2026-09-02", 60],
        ]),
        ts("COVERAGE_BRANCH_PCT", [
            ["2026-09-01", 50],
            ["2026-09-02", 54],
        ]),
        ts("COVERAGE_DELTA_PCT", [["2026-09-02", 0]]),
    ],
    breakdowns: [
        {
            dimension: "REPO",
            measure: "COVERAGE_LINE_PCT",
            items: [
                { key: "repo-1", label: "dev-health-web", value: 60 },
                { key: "0f2b9c1e-1111-4222-8333-944455556666", value: 72.4 },
            ],
        },
    ],
};

// The served baseline of the first repository; the second repository has no baseline row.
const baselines = [
    {
        repoId: "repo-1",
        repoName: "full-chaos/dev-health-web",
        lineBaselinePct: 58.2,
        lineDays: 22,
        branchBaselinePct: 51,
        branchDays: 20,
    },
];

async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await CoveragePage({ searchParams: Promise.resolve(searchParams) }));
}

const f = (filter: Record<string, unknown>) => ({
    f: Buffer.from(JSON.stringify(filter), "utf8").toString("base64url"),
});

/** True when `a` comes before `b` in the document. */
const before = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiHealth.mockResolvedValue({ ok: true });
    mockFetchCoverageMetrics.mockResolvedValue(served);
    mockFetchCoverageBaselines.mockResolvedValue(baselines);
    // No baseline of the scope: fewer than 7 days hold a value.
    mockFetchCoverageScopeBaseline.mockResolvedValue({ lineBaselinePct: null, lineDays: 2 });
});
afterEach(cleanup);

describe("TestOps Coverage page — approved layout", () => {
    it("orders the page: header, scope bar, tab row, tiles, Coverage against baseline, Repository coverage, then the trend", async () => {
        await renderPage();
        const order = [
            screen.getByRole("heading", { level: 1, name: "TestOps" }),
            screen.getByTestId("scope-bar"),
            screen.getByTestId("testops-tabs"),
            screen.getByTestId("testops-coverage-tiles"),
            screen.getByTestId("testops-coverage-baseline"),
            screen.getByTestId("testops-repository-coverage"),
            screen.getByRole("heading", { level: 2, name: "Line Coverage Trend" }),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        expect(screen.getByTestId("testops-tabs")).toHaveAttribute("data-active", "coverage");
        // The bar chart "Coverage by Repository" is replaced by the table.
        expect(screen.queryByText("Coverage by Repository")).toBeNull();
    });

    it("draws three tiles in one 3-column strip; Line Coverage has no sparkline, the others keep theirs", async () => {
        await renderPage();
        const strip = screen.getByTestId("testops-coverage-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        const tiles = within(strip).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Line Coverage",
            "Branch Coverage",
            "Coverage Delta",
        ]);
        // Latest served bucket of the first served series; a served 0 is 0.
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual(["60", "54", "0"]);
        expect(tiles.map((tile) => tile.getAttribute("data-hide-trend"))).toEqual([
            "true",
            "false",
            "false",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-spark-points"))).toEqual([
            "none",
            "2",
            "1",
        ]);
        // No short note on these tiles (the long definitions are in the drawer).
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual(["", "", ""]);
    });

    it("renders every served team series and latest value when coverage has more than one series", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({
            ...served,
            timeseries: [
                ts("COVERAGE_LINE_PCT", [["2026-09-01", 41], ["2026-09-02", 42]], "team-a"),
                ts("COVERAGE_LINE_PCT", [["2026-09-01", 88], ["2026-09-02", 89]], "team-b"),
                ts("COVERAGE_BRANCH_PCT", [["2026-09-01", 61], ["2026-09-02", 62]], "team-a"),
                ts("COVERAGE_BRANCH_PCT", [["2026-09-01", 98], ["2026-09-02", 99]], "team-b"),
                ts("COVERAGE_DELTA_PCT", [["2026-09-01", 0], ["2026-09-02", 1]], "team-a"),
                ts("COVERAGE_DELTA_PCT", [["2026-09-01", 2], ["2026-09-02", 3]], "team-b"),
            ],
        });
        mockFetchCoverageScopeBaseline.mockResolvedValue({ lineBaselinePct: 82.6, lineDays: 30 });

        await renderPage();

        const tiles = within(screen.getByTestId("testops-coverage-tiles")).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Line Coverage · Team: team-a",
            "Line Coverage · Team: team-b",
            "Branch Coverage · Team: team-a",
            "Branch Coverage · Team: team-b",
            "Coverage Delta · Team: team-a",
            "Coverage Delta · Team: team-b",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual([
            "42",
            "89",
            "62",
            "99",
            "1",
            "3",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-hide-trend"))).toEqual([
            "true",
            "true",
            "false",
            "false",
            "false",
            "false",
        ]);

        expect(screen.getByRole("heading", { level: 2, name: "Line Coverage Trends" })).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { level: 3, name: "Line Coverage Trend · Team: team-a" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { level: 3, name: "Line Coverage Trend · Team: team-b" }),
        ).toBeInTheDocument();
        expect(timeseriesSpy.mock.calls.map(([props]) => props)).toEqual([
            {
                data: [
                    { day: "2026-09-01", value: 41 },
                    { day: "2026-09-02", value: 42 },
                ],
                valueFormat: "percent",
                baseline: { value: 82.6, label: "Scope target baseline" },
            },
            {
                data: [
                    { day: "2026-09-01", value: 88 },
                    { day: "2026-09-02", value: 89 },
                ],
                valueFormat: "percent",
                baseline: { value: 82.6, label: "Scope target baseline" },
            },
        ]);
    });

    it("asks for branch coverage by repository beside line coverage, in the same request", async () => {
        await renderPage();
        expect(mockFetchCoverageMetrics).toHaveBeenCalledTimes(1);
        const batch = mockFetchCoverageMetrics.mock.calls[0][0] as {
            breakdowns: Array<{ dimension: string; measure: string; topN: number; dateRange: unknown }>;
        };
        expect(batch.breakdowns.map(({ dimension, measure, topN }) => [dimension, measure, topN])).toEqual([
            ["REPO", "COVERAGE_LINE_PCT", 10],
            // The largest topN the API accepts, so the branch list is complete whenever it can be.
            ["REPO", "COVERAGE_BRANCH_PCT", 100],
        ]);
        // Both read the same window.
        expect(batch.breakdowns[1].dateRange).toEqual(batch.breakdowns[0].dateRange);
    });

    it("draws each repository's served branch coverage, joined by repository key; a null value reads 'Not reported'", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({
            ...served,
            breakdowns: [
                ...served.breakdowns,
                {
                    dimension: "REPO",
                    measure: "COVERAGE_BRANCH_PCT",
                    // Ordered by its own measure, and the unresolved repository has no branch figure.
                    items: [
                        { key: "0f2b9c1e-1111-4222-8333-944455556666", value: null },
                        { key: "repo-1", label: "dev-health-web", value: 54 },
                    ],
                },
            ],
        });
        await renderPage();
        const repos = within(screen.getByTestId("testops-coverage-baseline")).getAllByTestId(
            "testops-coverage-baseline-repo",
        );
        expect(
            within(repos[0])
                .getAllByTestId("meter-row")
                .map((row) => row.textContent),
        ).toEqual(["Line coverage60% · baseline 58%", "Branch coverage54% · baseline 51%"]);
        const second = within(repos[1]).getAllByTestId("meter-row");
        expect(second[1]).toHaveTextContent("Branch coverageNot reported");
        expect(second[1]).toHaveAttribute("data-reported", "false");
        // The table keeps its three approved columns.
        expect(
            within(screen.getByTestId("testops-repository-coverage-table"))
                .getAllByRole("columnheader")
                .map((th) => th.textContent),
        ).toEqual(["Repository", "Line coverage", "Baseline"]);
    });

    it("reads a line coverage that is not served as 'Not reported' in the card and in the table, never 0%", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({
            ...served,
            breakdowns: [
                {
                    dimension: "REPO",
                    measure: "COVERAGE_LINE_PCT",
                    items: [{ key: "repo-1", label: "dev-health-web", value: null }],
                },
            ],
        });
        await renderPage();
        const [repo] = within(screen.getByTestId("testops-coverage-baseline")).getAllByTestId(
            "testops-coverage-baseline-repo",
        );
        // The served baseline stays, beside the row name.
        expect(within(repo).getAllByTestId("meter-row")[0]).toHaveTextContent(
            "Line coverage (baseline 58%)Not reported",
        );
        const [row] = within(screen.getByTestId("testops-repository-coverage-table")).getAllByTestId(
            "testops-repository-coverage-row",
        );
        expect(
            within(row)
                .getAllByRole("cell")
                .map((td) => td.textContent),
        ).toEqual(["dev-health-web", "Not reported", "58%"]);
    });

    it("shows each repository against its own served baseline: served line coverage; branch coverage not reported when no branch answer is served", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-coverage-baseline");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Coverage against baseline",
        );
        // No one baseline for all repositories: no pill in the card head.
        expect(within(card).queryByTestId("testops-coverage-baseline-pill")).toBeNull();
        const repos = within(card).getAllByTestId("testops-coverage-baseline-repo");
        expect(repos).toHaveLength(2);
        expect(repos[0]).toHaveTextContent("dev-health-web");
        const rows = within(repos[0]).getAllByTestId("meter-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "Line coverage60% · baseline 58%",
            "Branch coverage (baseline 51%)Not reported",
        ]);
        expect(rows[1]).toHaveAttribute("data-reported", "false");
        // An unresolved repository id is never shown as a bare UUID.
        expect(repos[1]).not.toHaveTextContent("0f2b9c1e-1111-4222-8333-944455556666");
        // The second repository has no baseline row: "Not reported", never 0 and never 80%.
        expect(within(repos[1]).getAllByTestId("meter-row")[0]).toHaveTextContent(
            "72% · baseline Not reported",
        );
        expect(card).not.toHaveTextContent("80%");
        expect(within(card).getByTestId("testops-coverage-baseline-note")).toHaveTextContent(
            "The baseline of a repository is its own average coverage over the 30 days that end on the last day of the window.",
        );
    });

    it("lists the repositories in the 'Repository coverage' table: Repository, Line coverage, Baseline", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-repository-coverage");
        const table = within(card).getByTestId("testops-repository-coverage-table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((th) => th.textContent),
        ).toEqual(["Repository", "Line coverage", "Baseline"]);
        const rows = within(table).getAllByTestId("testops-repository-coverage-row");
        expect(
            rows.map((row) =>
                within(row)
                    .getAllByRole("cell")
                    .map((td) => td.textContent),
            ),
        ).toEqual([
            ["dev-health-web", "60%", "58%"],
            [expect.not.stringContaining("0f2b9c1e-1111"), "72%", "Not reported"],
        ]);
        // The days behind the served baseline are its tooltip.
        expect(within(rows[0]).getByTitle("30-day average of 22 days")).toHaveTextContent("58%");
        expect(card).toHaveTextContent(
            "The baseline of a repository is its own average line coverage over the 30 days that end on the last day of the window. A repository with fewer than 7 days of coverage in those 30 days has no baseline.",
        );
    });

    const SERIES = [
        { day: "2026-09-01", value: 59 },
        { day: "2026-09-02", value: 60 },
    ];
    const fact = (container: HTMLElement) =>
        container.querySelector('[data-annotation="Chart threshold"]');

    it("draws the served scope baseline as the trend's baseline line and as the fact 'Target baseline'", async () => {
        mockFetchCoverageScopeBaseline.mockResolvedValue({ lineBaselinePct: 82.6, lineDays: 30 });
        const { container } = await renderPage();
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toEqual({
            data: SERIES,
            valueFormat: "percent",
            // The served value, not rounded and not a constant.
            baseline: { value: 82.6, label: "Target baseline" },
        });
        expect(fact(container)).toHaveTextContent("Target baseline83%");
        // The hint of the value: what the target is, and the served days behind it.
        expect(
            within(fact(container) as HTMLElement).getByTitle(
                "Running 30-day average of the organization's line coverage; 30 of the 30 days hold a value",
            ),
        ).toHaveTextContent("83%");
        expect(screen.queryByText("80%")).toBeNull();
    });

    it("draws a served baseline of 0 as a line at 0 and '0%'", async () => {
        mockFetchCoverageScopeBaseline.mockResolvedValue({ lineBaselinePct: 0, lineDays: 9 });
        const { container } = await renderPage();
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            baseline: { value: 0, label: "Target baseline" },
        });
        expect(fact(container)).toHaveTextContent("Target baseline0%");
    });

    it("with no scope baseline: the fact stays and reads 'Not reported', and the chart has no baseline line", async () => {
        const { container } = await renderPage();
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toEqual({ data: SERIES, valueFormat: "percent" });
        expect(fact(container)).not.toBeNull();
        expect(fact(container)).toHaveTextContent("Target baselineNot reported");
        expect(fact(container)).not.toHaveTextContent("%");
        // The hint stays, with the served days (2 in this answer).
        expect(
            within(fact(container) as HTMLElement).getByTitle(
                "Running 30-day average of the organization's line coverage; 2 of the 30 days hold a value",
            ),
        ).toHaveTextContent("Not reported");
    });

    it("with a failed scope baseline read: the fact says 'Could not be read', no line, and the trend stays", async () => {
        mockFetchCoverageScopeBaseline.mockResolvedValue({ fetchFailed: true });
        const { container } = await renderPage();
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toEqual({ data: SERIES, valueFormat: "percent" });
        expect(fact(container)).toHaveTextContent("Target baselineCould not be read");
        expect(fact(container)).not.toHaveTextContent("Not reported");
    });

    it("asks for the selected team's baseline of the 30 days that end on the last day of the window", async () => {
        await renderPage(
            f({
                time: { range_days: 14, start_date: "2026-09-01", end_date: "2026-09-30" },
                scope: { level: "team", ids: ["t1"] },
                who: {},
                what: {},
                why: {},
                how: {},
            }),
        );
        expect(mockFetchCoverageScopeBaseline).toHaveBeenCalledTimes(1);
        const [input, isTestMode] = mockFetchCoverageScopeBaseline.mock.calls[0];
        expect(input).toEqual({ endDate: "2026-10-01", teamIds: ["t1"] });
        expect(isTestMode).toBe(false);
    });

    it("asks for the baselines of the 30 days that end on the last day of the window", async () => {
        await renderPage(
            f({
                time: { range_days: 14, start_date: "2026-09-01", end_date: "2026-09-30" },
                scope: { level: "team", ids: [] },
                who: {},
                what: {},
                why: {},
                how: {},
            }),
        );
        expect(mockFetchCoverageBaselines).toHaveBeenCalledTimes(1);
        const [input, isTestMode] = mockFetchCoverageBaselines.mock.calls[0];
        // The API's end date is not included: the day after the window's last day.
        expect(input).toEqual({ endDate: "2026-10-01" });
        expect(isTestMode).toBe(false);
    });

    it("sends the scope bar's team and repository selection to every coverage read", async () => {
        await renderPage(
            f({
                time: { range_days: 14, start_date: "2026-09-01", end_date: "2026-09-14" },
                scope: { level: "team", ids: ["t1"] },
                who: {},
                what: { repos: ["r1", "r2"] },
                why: {},
                how: {},
            }),
        );
        const scope = { repoIds: ["r1", "r2"], teamIds: ["t1"] };
        expect(mockFetchCoverageBaselines.mock.calls.at(-1)?.[0]).toEqual({
            endDate: "2026-09-15",
            ...scope,
        });
        expect(mockFetchCoverageScopeBaseline.mock.calls.at(-1)?.[0]).toEqual({
            endDate: "2026-09-15",
            ...scope,
        });
        expect(mockFetchCoverageMetrics.mock.calls.at(-1)?.[0]).toMatchObject({
            filters: {
                scope: { level: "TEAM", ids: ["t1"] },
                what: { repos: ["r1", "r2"] },
            },
        });
    });

    it("says 'Could not be read' for the baselines when their read failed, and keeps the coverage values", async () => {
        mockFetchCoverageBaselines.mockResolvedValue({ fetchFailed: true });
        await renderPage();
        const [repo] = within(screen.getByTestId("testops-coverage-baseline")).getAllByTestId(
            "testops-coverage-baseline-repo",
        );
        expect(within(repo).getAllByTestId("meter-row")[0]).toHaveTextContent(
            "Line coverage60% · baseline Could not be read",
        );
        const rows = within(screen.getByTestId("testops-repository-coverage-table")).getAllByTestId(
            "testops-repository-coverage-row",
        );
        expect(
            rows.map((row) =>
                within(row)
                    .getAllByRole("cell")
                    .map((td) => td.textContent),
            ),
        ).toEqual([
            ["dev-health-web", "60%", "Could not be read"],
            [expect.not.stringContaining("0f2b9c1e-1111"), "72%", "Could not be read"],
        ]);
    });

    it("shows empty states when no repository is served, and errors when the request failed", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({ timeseries: [], breakdowns: [] });
        await renderPage();
        expect(screen.getByText("No repository coverage")).toBeInTheDocument();
        expect(
            within(screen.getByTestId("testops-repository-coverage")).getByText(
                "No repository coverage for this window or scope.",
            ),
        ).toBeInTheDocument();
        cleanup();

        mockFetchCoverageMetrics.mockResolvedValue({
            timeseries: [],
            breakdowns: [],
            fetchFailed: true,
        });
        await renderPage();
        expect(screen.getByText("Coverage could not be loaded")).toBeInTheDocument();
        expect(screen.getByText("Repository coverage could not be loaded")).toBeInTheDocument();
        expect(screen.queryByText("No repository coverage")).toBeNull();
        expect(screen.queryByTestId("testops-repository-coverage-table")).toBeNull();
    });

    it("gives the header a 'View evidence' subject with the tiles' served values and definitions", async () => {
        mockFetchCoverageMetrics.mockResolvedValue({
            ...served,
            timeseries: served.timeseries.filter((s) => s.measure !== "COVERAGE_DELTA_PCT"),
        });
        await renderPage();
        const evidence = screen.getByTestId("page-evidence");
        expect(evidence).toHaveAttribute("data-title", "TestOps coverage");
        const facts = within(within(evidence).getByTestId("testops-evidence-facts")).getAllByTestId(
            "evidence-fact",
        );
        expect(facts.map((fact) => fact.textContent)).toEqual([
            "Line Coverage60%",
            "Branch Coverage54%",
            "Coverage DeltaNot reported",
        ]);
        expect(within(evidence).getByTestId("testops-evidence-definitions")).toHaveTextContent(
            "Percentage of code branches covered by tests",
        );
    });
});
