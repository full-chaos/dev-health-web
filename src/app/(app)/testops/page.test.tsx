/** TestOps Overview page: the approved layout (5 tiles, CI and test health, Failure patterns, Investigate). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, rateChartSpy } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchTestOpsData: vi.fn(),
    rateChartSpy: vi.fn(),
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchTestOpsData: mockFetchTestOpsData }));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: () => <div data-testid="scope-bar" />,
}));
vi.mock("./TestOpsTabs", () => ({
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
        unit,
        caption,
    }: {
        label: string;
        value?: number;
        unit?: string;
        caption?: string;
    }) => (
        <article
            data-testid="metric-tile"
            data-label={label}
            data-value={value === undefined ? "undefined" : String(value)}
            data-unit={unit}
            data-caption={caption ?? ""}
        />
    ),
}));
vi.mock("@/components/testops/PipelineRateTrendChart", () => ({
    PipelineRateTrendChart: (props: unknown) => {
        rateChartSpy(props);
        return <div data-testid="rate-trend-chart" />;
    },
}));
vi.mock("@/components/charts/HeatmapChart", () => ({
    HeatmapChart: () => <div data-testid="heatmap-chart" />,
}));

import TestOpsPage from "./page";

const ts = (measure: string, buckets: Array<[string, number | null]>) => ({
    dimension: "TEAM",
    dimensionValue: "all",
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

const served = {
    pipelines: {
        timeseries: [
            ts("PIPELINE_SUCCESS_RATE", [
                ["2026-09-01", 90],
                ["2026-09-02", 91],
            ]),
            ts("PIPELINE_FAILURE_RATE", [
                ["2026-09-01", 6],
                ["2026-09-02", 3],
            ]),
            ts("PIPELINE_DURATION_P95", [["2026-09-02", 9.8]]),
        ],
        breakdowns: [
            {
                dimension: "TEAM",
                measure: "PIPELINE_FAILURE_RATE",
                items: [{ key: "None", value: 3 }],
            },
        ],
    },
    tests: { timeseries: [ts("TEST_FLAKE_RATE", [["2026-09-02", 0]])], breakdowns: [] },
    coverage: { timeseries: [ts("COVERAGE_LINE_PCT", [["2026-09-02", 60]])], breakdowns: [] },
};

async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await TestOpsPage({ searchParams: Promise.resolve(searchParams) }));
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

describe("TestOps Overview page — approved layout", () => {
    it("orders the page: header, scope bar, tab row, tiles, CI and test health, then the two cards", async () => {
        await renderPage();
        const order = [
            screen.getByRole("heading", { level: 1, name: "TestOps" }),
            screen.getByTestId("scope-bar"),
            screen.getByTestId("testops-tabs"),
            screen.getByTestId("testops-overview-tiles"),
            screen.getByTestId("testops-ci-health"),
            screen.getByTestId("testops-failure-patterns"),
            screen.getByTestId("testops-investigate"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        expect(screen.getByTestId("testops-tabs")).toHaveAttribute("data-active", "overview");
    });

    it("uses the approved subtitle (no 'durable')", async () => {
        await renderPage();
        expect(
            screen.getByText("Pipeline, test, and coverage operations in one destination."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/durable/)).toBeNull();
    });

    it("has exactly the five approved tiles, in order, with the served values", async () => {
        await renderPage();
        const strip = screen.getByTestId("testops-overview-tiles");
        expect(strip).toHaveAttribute("data-columns", "5");
        const tiles = within(strip).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Success Rate",
            "Failure Rate",
            "P95 Duration",
            "Flake Rate",
            "Line Coverage",
        ]);
        // Latest served bucket; a served 0 is 0.
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual([
            "91",
            "3",
            "9.8",
            "0",
            "60",
        ]);
        // The tile note is the short approved note, not the long definition.
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual([
            "completed pipeline runs",
            "completed pipeline runs",
            "pipeline execution",
            "",
            "",
        ]);
        // Queue Time and Rerun Rate belong to the Pipelines tab.
        expect(screen.queryByText("Queue Time")).toBeNull();
        expect(screen.queryByText("Rerun Rate")).toBeNull();
    });

    it("shows a tile with no served value as missing, never as 0", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            ...served,
            coverage: { timeseries: [], breakdowns: [] },
        });
        await renderPage();
        const coverage = screen
            .getAllByTestId("metric-tile")
            .find((tile) => tile.getAttribute("data-label") === "Line Coverage");
        expect(coverage).toHaveAttribute("data-value", "undefined");
    });

    it("has no 'TestOps summary' card", async () => {
        await renderPage();
        expect(screen.queryByText("TestOps summary")).toBeNull();
    });

    it("draws 'CI and test health' as ONE chart with the served success and failure series", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-ci-health");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "CI and test health",
        );
        expect(within(card).getAllByTestId("rate-trend-chart")).toHaveLength(1);
        expect(rateChartSpy.mock.calls.at(-1)?.[0]).toEqual({
            points: [
                { day: "2026-09-01", success: 90, failure: 6 },
                { day: "2026-09-02", success: 91, failure: 3 },
            ],
        });
        // The denominator caveat stays with the chart.
        expect(card).toHaveTextContent("need not sum to 100%");
    });

    it("shows an empty state, not a flat chart, when no rate is served", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: { timeseries: [], breakdowns: [] },
            tests: { timeseries: [], breakdowns: [] },
            coverage: { timeseries: [], breakdowns: [] },
        });
        await renderPage();
        const card = screen.getByTestId("testops-ci-health");
        expect(within(card).queryByTestId("rate-trend-chart")).toBeNull();
        expect(within(card).getByText("Pipeline trend not populated")).toBeInTheDocument();
        expect(screen.getByText("No failure patterns")).toBeInTheDocument();
    });

    it("shows errors, not empty states, when the request failed", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: { timeseries: [], breakdowns: [] },
            tests: { timeseries: [], breakdowns: [] },
            coverage: { timeseries: [], breakdowns: [] },
            fetchFailed: true,
        });
        await renderPage();
        expect(screen.getByText("Pipeline trend could not be loaded")).toBeInTheDocument();
        expect(screen.getByText("Failure patterns could not be loaded")).toBeInTheDocument();
        expect(screen.queryByText("Pipeline trend not populated")).toBeNull();
        expect(screen.queryByText("No failure patterns")).toBeNull();
    });

    it("asks for the same failure-rate breakdown as the Pipelines tab and draws 'Failure patterns' from it", async () => {
        await renderPage();
        const [batch] = mockFetchTestOpsData.mock.calls.at(-1) as [
            {
                timeseries: Array<{ measure: string }>;
                breakdowns: Array<{ dimension: string; measure: string; topN: number }>;
            },
        ];
        expect(batch.breakdowns).toHaveLength(1);
        expect(batch.breakdowns[0]).toMatchObject({
            dimension: "TEAM",
            measure: "PIPELINE_FAILURE_RATE",
            topN: 10,
        });
        expect(batch.timeseries.map((t) => t.measure)).toEqual([
            "PIPELINE_SUCCESS_RATE",
            "PIPELINE_FAILURE_RATE",
            "PIPELINE_DURATION_P95",
            "TEST_FLAKE_RATE",
            "COVERAGE_LINE_PCT",
        ]);
        // The served breakdown has only the unattributed bucket: the approved empty state.
        const state = screen.getByTestId("testops-failure-patterns-unattributed");
        expect(state).toHaveTextContent("Unattributed");
        expect(state).toHaveTextContent("3%");
    });

    it("lists Pipelines, Tests and Coverage under 'Investigate TestOps', each with an 'Open' link", async () => {
        await renderPage({ role: "em" });
        const card = screen.getByTestId("testops-investigate");
        const links = within(card).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
            "Open Pipelines",
            "Open Tests",
            "Open Coverage",
        ]);
        expect(links.map((link) => (link.getAttribute("href") ?? "").split("?")[0])).toEqual([
            "/testops/pipelines",
            "/testops/tests",
            "/testops/coverage",
        ]);
        for (const link of links) {
            const query = new URLSearchParams((link.getAttribute("href") ?? "").split("?")[1]);
            expect(query.get("f")).toBeTruthy();
            expect(query.get("role")).toBe("em");
        }
    });

    it("gives the header a 'View evidence' subject with the tiles' served values as facts", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            ...served,
            coverage: { timeseries: [], breakdowns: [] },
        });
        await renderPage();
        const evidence = screen.getByTestId("page-evidence");
        expect(evidence).toHaveAttribute("data-title", "TestOps overview");
        const facts = within(within(evidence).getByTestId("testops-evidence-facts")).getAllByTestId(
            "evidence-fact",
        );
        expect(facts.map((fact) => fact.textContent)).toEqual([
            "Success Rate91%",
            "Failure Rate3%",
            "P95 Duration9.8m",
            "Flake Rate0%",
            "Line CoverageNot reported",
        ]);
        expect(facts[4]).toHaveAttribute("data-reported", "false");
        // The full definitions (no longer on the tiles) are in the drawer.
        const definitions = within(evidence).getByTestId("testops-evidence-definitions");
        expect(definitions).toHaveTextContent(
            "Share of completed pipeline runs that succeed; excludes cancelled and skipped runs",
        );
        expect(definitions).toHaveTextContent("need not sum to 100%");
        expect(within(definitions).getAllByTestId("evidence-fact")).toHaveLength(5);
    });
});
