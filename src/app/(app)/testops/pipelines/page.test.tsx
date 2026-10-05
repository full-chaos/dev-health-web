/** TestOps Pipelines page: the approved layout (5 tiles, Pipeline trends, Failure patterns, Investigate). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, rateChartSpy } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchTestOpsData: vi.fn(),
    rateChartSpy: vi.fn(),
}));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
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
    usePathname: () => "/testops/pipelines",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchTestOpsData: mockFetchTestOpsData }));
// The rest of the module stays real: the card's failed-read text loads the logger, which reads it.
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

import PipelinesPage from "./page";

const ts = (measure: string, buckets: Array<[string, number | null]>) => ({
    dimension: "TEAM",
    dimensionValue: "all",
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

const empty = { timeseries: [], breakdowns: [] };

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
            ts("PIPELINE_QUEUE_TIME", [["2026-09-02", 0]]),
        ],
        breakdowns: [
            {
                dimension: "TEAM",
                measure: "PIPELINE_FAILURE_RATE",
                items: [
                    { key: "team-a", value: 5 },
                    { key: "None", value: 2 },
                ],
            },
        ],
    },
    tests: empty,
    coverage: empty,
};

async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await PipelinesPage({ searchParams: Promise.resolve(searchParams) }));
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

describe("TestOps Pipelines page — approved layout", () => {
    it("orders the page: header, scope bar, tab row, tiles, Pipeline trends, then the two cards", async () => {
        await renderPage();
        const order = [
            screen.getByRole("heading", { level: 1, name: "TestOps" }),
            screen.getByTestId("scope-bar"),
            screen.getByTestId("testops-tabs"),
            screen.getByTestId("testops-pipelines-tiles"),
            screen.getByTestId("testops-pipeline-trends"),
            screen.getByTestId("testops-failure-patterns"),
            screen.getByTestId("testops-investigate"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(before(order[i], order[i + 1])).toBe(true);
        }
        expect(screen.getByTestId("testops-tabs")).toHaveAttribute("data-active", "pipelines");
    });

    it("draws the five pipeline tiles as one 5-column strip, with served values and the short notes", async () => {
        await renderPage();
        const strip = screen.getByTestId("testops-pipelines-tiles");
        expect(strip).toHaveAttribute("data-columns", "5");
        const tiles = within(strip).getAllByTestId("metric-tile");
        expect(tiles.map((tile) => tile.getAttribute("data-label"))).toEqual([
            "Success Rate",
            "Failure Rate",
            "P95 Duration",
            "Queue Time",
            "Rerun Rate",
        ]);
        // Latest served bucket; a served 0 is 0; a measure with no series is missing, not 0.
        expect(tiles.map((tile) => tile.getAttribute("data-value"))).toEqual([
            "91",
            "3",
            "9.8",
            "0",
            "undefined",
        ]);
        expect(tiles.map((tile) => tile.getAttribute("data-caption"))).toEqual([
            "completed pipeline runs",
            "completed pipeline runs",
            "pipeline execution",
            "waiting to start",
            "pipelines rerun",
        ]);
    });

    it("draws 'Pipeline trends' as ONE chart with the served success AND failure series", async () => {
        await renderPage();
        const card = screen.getByTestId("testops-pipeline-trends");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Pipeline trends",
        );
        expect(within(card).getAllByTestId("rate-trend-chart")).toHaveLength(1);
        expect(rateChartSpy.mock.calls.at(-1)?.[0]).toEqual({
            points: [
                { day: "2026-09-01", success: 90, failure: 6 },
                { day: "2026-09-02", success: 91, failure: 3 },
            ],
        });
        // The old one-series card is gone.
        expect(screen.queryByText("Success Rate Trend")).toBeNull();
    });

    it("keeps the denominators note: with the chart and with Failure patterns", async () => {
        await renderPage();
        const trends = screen.getByTestId("testops-pipeline-trends");
        expect(trends).toHaveTextContent(
            "Success Rate and Failure Rate are shares of completed pipeline runs and need not sum to 100% — runs can be cancelled or skipped.",
        );
        expect(screen.getByTestId("testops-failure-patterns")).toHaveTextContent(
            "a different denominator from the headline Failure Rate, so the figures are not directly comparable",
        );
    });

    it("draws 'Failure patterns' from the served breakdown: the heatmap of real groups with the Unattributed caveat", async () => {
        await renderPage();
        const [batch] = mockFetchTestOpsData.mock.calls.at(-1) as [
            { breakdowns: Array<{ dimension: string; measure: string; topN: number }> },
        ];
        expect(batch.breakdowns[0]).toMatchObject({
            dimension: "TEAM",
            measure: "PIPELINE_FAILURE_RATE",
            topN: 10,
        });
        const card = screen.getByTestId("testops-failure-patterns");
        expect(within(card).getByTestId("heatmap-chart")).toBeInTheDocument();
        expect(card).toHaveTextContent("read its share as a data-quality caveat");
    });

    it("draws the 'Unattributed' empty state when every failure is unattributed", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            ...served,
            pipelines: {
                ...served.pipelines,
                breakdowns: [
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_FAILURE_RATE",
                        items: [{ key: "None", value: 7 }],
                    },
                ],
            },
        });
        await renderPage();
        const state = screen.getByTestId("testops-failure-patterns-unattributed");
        expect(state).toHaveTextContent("Unattributed");
        expect(state).toHaveTextContent("7%");
        expect(screen.queryByTestId("heatmap-chart")).toBeNull();
    });

    it("shows empty states when nothing is served, and errors when the request failed", async () => {
        mockFetchTestOpsData.mockResolvedValue({ pipelines: empty, tests: empty, coverage: empty });
        await renderPage();
        expect(screen.getByText("Pipeline trend not populated")).toBeInTheDocument();
        expect(screen.getByText("No failure patterns")).toBeInTheDocument();
        expect(screen.queryByTestId("rate-trend-chart")).toBeNull();
        cleanup();

        mockFetchTestOpsData.mockResolvedValue({
            pipelines: empty,
            tests: empty,
            coverage: empty,
            fetchFailed: true,
        });
        await renderPage();
        expect(screen.getByText("Pipeline trend could not be loaded")).toBeInTheDocument();
        expect(screen.getByText("Failure patterns could not be loaded")).toBeInTheDocument();
        expect(screen.queryByText("Pipeline trend not populated")).toBeNull();
        expect(screen.queryByText("No failure patterns")).toBeNull();
    });

    it("lists Pipelines, Tests and Coverage under 'Investigate TestOps', each with an 'Open' link", async () => {
        await renderPage({ role: "em" });
        const links = within(screen.getByTestId("testops-investigate")).getAllByRole("link");
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

    it("gives the header a 'View evidence' subject with the tiles' served values and definitions", async () => {
        await renderPage();
        const evidence = screen.getByTestId("page-evidence");
        expect(evidence).toHaveAttribute("data-title", "TestOps pipelines");
        const facts = within(within(evidence).getByTestId("testops-evidence-facts")).getAllByTestId(
            "evidence-fact",
        );
        expect(facts.map((fact) => fact.textContent)).toEqual([
            "Success Rate91%",
            "Failure Rate3%",
            "P95 Duration9.8m",
            "Queue Time0m",
            "Rerun RateNot reported",
        ]);
        const definitions = within(evidence).getByTestId("testops-evidence-definitions");
        expect(definitions).toHaveTextContent("Average time pipelines spend waiting to start");
        expect(definitions).toHaveTextContent("Percentage of pipelines that are rerun");
    });
});

describe("PipelinesPage org scope (CHAOS-8272)", () => {
    it("shows one plain sentence and makes no request when the session has no org", async () => {
        requireSessionMock.mockResolvedValue({ user: {} });
        mockFetchTestOpsData.mockClear();
        render(await PipelinesPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
        expect(mockFetchTestOpsData).not.toHaveBeenCalled();
    });
});
