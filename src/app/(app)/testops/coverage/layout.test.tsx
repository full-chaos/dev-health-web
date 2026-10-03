/** TestOps Coverage page: the approved layout (3 tiles, Coverage against baseline, Repository coverage table). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchCoverageMetrics, timeseriesSpy } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchCoverageMetrics: vi.fn(),
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
vi.mock("@/lib/testops/fetchers", () => ({ fetchCoverageMetrics: mockFetchCoverageMetrics }));
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

const ts = (measure: string, buckets: Array<[string, number | null]>) => ({
    dimension: "TEAM",
    dimensionValue: "t",
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

async function renderPage() {
    return render(await CoveragePage({ searchParams: Promise.resolve({}) }));
}

/** True when `a` comes before `b` in the document. */
const before = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiHealth.mockResolvedValue({ ok: true });
    mockFetchCoverageMetrics.mockResolvedValue(served);
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

    it("asks for branch coverage by repository beside line coverage, in the same request", async () => {
        await renderPage();
        expect(mockFetchCoverageMetrics).toHaveBeenCalledTimes(1);
        const batch = mockFetchCoverageMetrics.mock.calls[0][0] as {
            breakdowns: Array<{ dimension: string; measure: string; topN: number; dateRange: unknown }>;
        };
        expect(batch.breakdowns.map(({ dimension, measure, topN }) => [dimension, measure, topN])).toEqual([
            ["REPO", "COVERAGE_LINE_PCT", 10],
            ["REPO", "COVERAGE_BRANCH_PCT", 10],
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
        ).toEqual(["Line coverage60%", "Branch coverage54%"]);
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
        expect(within(repo).getAllByTestId("meter-row")[0]).toHaveTextContent(
            "Line coverageNot reported",
        );
        const [row] = within(screen.getByTestId("testops-repository-coverage-table")).getAllByTestId(
            "testops-repository-coverage-row",
        );
        expect(
            within(row)
                .getAllByRole("cell")
                .map((td) => td.textContent),
        ).toEqual(["dev-health-web", "Not reported", "80%"]);
    });

    it("shows each repository against the one baseline: served line coverage; branch coverage not reported when no branch answer is served", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-coverage-baseline");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Coverage against baseline",
        );
        expect(within(card).getByTestId("testops-coverage-baseline-pill")).toHaveTextContent(
            "80% baseline",
        );
        const repos = within(card).getAllByTestId("testops-coverage-baseline-repo");
        expect(repos).toHaveLength(2);
        expect(repos[0]).toHaveTextContent("dev-health-web");
        const rows = within(repos[0]).getAllByTestId("meter-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "Line coverage60%",
            "Branch coverageNot reported",
        ]);
        expect(rows[1]).toHaveAttribute("data-reported", "false");
        // An unresolved repository id is never shown as a bare UUID.
        expect(repos[1]).not.toHaveTextContent("0f2b9c1e-1111-4222-8333-944455556666");
        expect(within(repos[1]).getAllByTestId("meter-row")[0]).toHaveTextContent(
            "72%",
        );
        expect(card).toHaveTextContent("A per-repository baseline is not reported yet.");
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
            ["dev-health-web", "60%", "80%"],
            [expect.not.stringContaining("0f2b9c1e-1111"), "72%", "80%"],
        ]);
        expect(card).toHaveTextContent("a per-repository baseline is not reported yet");
    });

    it("keeps the Line Coverage Trend below, with the served series and the target line", async () => {
        await renderPage();
        expect(timeseriesSpy.mock.calls.at(-1)?.[0]).toEqual({
            data: [
                { day: "2026-09-01", value: 59 },
                { day: "2026-09-02", value: 60 },
            ],
            valueFormat: "percent",
            baseline: { value: 80, label: "Target baseline" },
        });
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
