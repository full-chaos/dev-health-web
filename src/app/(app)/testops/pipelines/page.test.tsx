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
        valueText,
        valueIsMessage,
    }: {
        label: string;
        value?: number;
        unit?: string;
        caption?: string;
        valueText?: string;
        valueIsMessage?: boolean;
    }) => (
        <article
            data-testid="metric-tile"
            data-label={label}
            data-value-text={valueText ?? ""}
            data-value-is-message={valueIsMessage ? "yes" : "no"}
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

// The served answer of a scope: its ORG series (the TestOps documents select scope).
const ts = (measure: string, buckets: Array<[string, number | null]>) => ({
    dimension: "TEAM",
    dimensionValue: "org",
    scope: "ORG",
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
            "Rerun RateUnknown",
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

describe("TestOps Pipelines tiles read one scope, never a mean across scopes", () => {
    const scoped = (
        measure: string,
        dimensionValue: string,
        scope: "DIMENSION" | "ORG",
        values: Array<[string, number]>,
    ) => ({
        dimension: "TEAM",
        dimensionValue,
        scope,
        measure,
        buckets: values.map(([date, value]) => ({ date, value })),
    });
    // team-a 1 of 1 runs passed, team-b 1 of 9, the org 2 of 10 (the API's ORG series).
    const success = [
        scoped("PIPELINE_SUCCESS_RATE", "team-a", "DIMENSION", [["2026-11-13", 100]]),
        scoped("PIPELINE_SUCCESS_RATE", "team-b", "DIMENSION", [["2026-11-13", 100 / 9]]),
        scoped("PIPELINE_SUCCESS_RATE", "org", "ORG", [["2026-11-13", 20]]),
    ];
    const failureTeams = [
        scoped("PIPELINE_FAILURE_RATE", "team-a", "DIMENSION", [["2026-11-13", 0]]),
        scoped("PIPELINE_FAILURE_RATE", "team-b", "DIMENSION", [["2026-11-13", 800 / 9]]),
    ];
    const tileValue = (label: string) =>
        screen
            .getAllByTestId("metric-tile")
            .find((tile) => tile.getAttribute("data-label") === label)
            ?.getAttribute("data-value");

    it("the Success Rate tile and trend show the ORG rate, not the mean of the teams and the org", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: { timeseries: [...success, ...failureTeams], breakdowns: [] },
            tests: empty,
            coverage: empty,
        });
        await renderPage();
        expect(tileValue("Success Rate")).toBe("20");
        expect(rateChartSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            points: [{ day: "2026-11-13", success: 20 }],
        });
    });

    it("with ORG series for both rates from the same rows, Success + Failure = 100", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: {
                timeseries: [
                    ...success,
                    ...failureTeams,
                    scoped("PIPELINE_FAILURE_RATE", "org", "ORG", [["2026-11-13", 80]]),
                ],
                breakdowns: [],
            },
            tests: empty,
            coverage: empty,
        });
        await renderPage();
        expect(tileValue("Success Rate")).toBe("20");
        expect(tileValue("Failure Rate")).toBe("80");
        expect(Number(tileValue("Success Rate")) + Number(tileValue("Failure Rate"))).toBe(100);
    });
});

describe("TestOps Pipelines applies the scope bar's filter", () => {
    const f = (filter: Record<string, unknown>) => ({
        f: Buffer.from(JSON.stringify(filter), "utf8").toString("base64url"),
    });
    const teamFilter = (ids: string[], repos: string[] = []) =>
        f({
            time: { range_days: 14 },
            scope: { level: "team", ids },
            who: {},
            what: repos.length > 0 ? { repos } : {},
            why: {},
            how: {},
        });

    it("sends the scope bar's team and repository selection to analytics", async () => {
        await renderPage(teamFilter(["t1"], ["r1"]));
        expect(mockFetchTestOpsData.mock.calls.at(-1)?.[0]).toMatchObject({
            filters: { scope: { level: "TEAM", ids: ["t1"] }, what: { repos: ["r1"] } },
        });
    });

    it("with no filter sends the organization scope", async () => {
        await renderPage();
        expect(mockFetchTestOpsData.mock.calls.at(-1)?.[0]).toMatchObject({
            filters: { scope: { level: "ORG" } },
        });
    });

    it("with one team selected, the tiles and the trend show the ORG series read under the team filter", async () => {
        const series = (
            measure: string,
            dimensionValue: string,
            scope: "DIMENSION" | "ORG",
            value: number,
        ) => ({
            dimension: "TEAM",
            dimensionValue,
            scope,
            measure,
            buckets: [{ date: "2026-11-13", value }],
        });
        // The API answers a team-b filter with team-b's series and the org series read under the
        // filter; the page reads the org series (on a real answer the two are equal).
        mockFetchTestOpsData.mockResolvedValue({
            pipelines: {
                timeseries: [
                    series("PIPELINE_SUCCESS_RATE", "team-b", "DIMENSION", 100 / 9),
                    series("PIPELINE_SUCCESS_RATE", "org", "ORG", 20),
                    series("PIPELINE_FAILURE_RATE", "team-b", "DIMENSION", 800 / 9),
                ],
                breakdowns: [],
            },
            tests: empty,
            coverage: empty,
        });
        await renderPage(teamFilter(["team-b"]));
        const success = screen
            .getAllByTestId("metric-tile")
            .find((tile) => tile.getAttribute("data-label") === "Success Rate");
        expect(Number(success?.getAttribute("data-value"))).toBe(20);
        const points = (
            rateChartSpy.mock.calls.at(-1)?.[0] as { points: Array<{ success: number }> }
        ).points;
        expect(points[0].success).toBe(20);
    });
});

describe("TestOps duration tiles read the served ORG series for every scope (0, 1, 2+ teams)", () => {
    const one = (
        measure: string,
        dimensionValue: string,
        scope: "DIMENSION" | "ORG",
        value: number,
    ) => ({
        dimension: "TEAM",
        dimensionValue,
        scope,
        measure,
        buckets: [{ date: "2026-11-13", value }],
    });
    const answer = (timeseries: ReturnType<typeof one>[]) => ({
        pipelines: { timeseries, breakdowns: [] },
        tests: { timeseries: [], breakdowns: [] },
        coverage: { timeseries: [], breakdowns: [] },
    });
    // The API's answer under the request's team filter: the ORG series (pooled under the filter) and the team series.
    const withOrg = answer([
        one("PIPELINE_DURATION_P95", "t1", "DIMENSION", 4),
        one("PIPELINE_DURATION_P95", "t2", "DIMENSION", 20),
        one("PIPELINE_DURATION_P95", "org", "ORG", 2),
        one("PIPELINE_QUEUE_TIME", "t1", "DIMENSION", 4),
        one("PIPELINE_QUEUE_TIME", "t2", "DIMENSION", 20),
        one("PIPELINE_QUEUE_TIME", "org", "ORG", 1.5),
    ]);
    const tile = (label: string) =>
        screen.getAllByTestId("metric-tile").find((t) => t.getAttribute("data-label") === label);
    const pick = (ids: string[]) => ({
        f: Buffer.from(
            JSON.stringify({
                time: { range_days: 14 },
                scope: { level: "team", ids },
                who: {},
                what: {},
                why: {},
                how: {},
            }),
            "utf8",
        ).toString("base64url"),
    });
    const expectValue = (label: string, value: string) => {
        expect(tile(label)?.getAttribute("data-value")).toBe(value);
        expect(tile(label)?.getAttribute("data-value-text")).toBe("");
        expect(tile(label)?.getAttribute("data-value-is-message")).toBe("no");
    };
    // "Not reported" is MetricCard's own text for a tile with no value and no value text (one unavailable state).
    const expectNotReported = (label: string) => {
        expect(tile(label)?.getAttribute("data-value")).toBe("undefined");
        expect(tile(label)?.getAttribute("data-value-text")).toBe("");
        expect(tile(label)?.getAttribute("data-value-is-message")).toBe("no");
    };

    it("W1 0 teams: the ORG value, not a team value or their mean", async () => {
        mockFetchTestOpsData.mockResolvedValue(withOrg);
        await renderPage();
        expectValue("P95 Duration", "2");
        expectValue("Queue Time", "1.5");
    });

    it("W2 2+ teams: the ORG value read under the filter, never the pick-one-team state", async () => {
        mockFetchTestOpsData.mockResolvedValue(withOrg);
        await renderPage(pick(["t1", "t2"]));
        expectValue("P95 Duration", "2");
        expectValue("Queue Time", "1.5");
        expect(screen.queryByText("Pick one team")).toBeNull();
    });

    it("W11 1 team: the ORG value under the one-team filter, not the team's own series", async () => {
        mockFetchTestOpsData.mockResolvedValue(withOrg);
        await renderPage(pick(["t2"]));
        expectValue("P95 Duration", "2");
        expectValue("Queue Time", "1.5");
    });

    it("W4 0 teams and no ORG series: Not reported, never the one served team series", async () => {
        mockFetchTestOpsData.mockResolvedValue(
            answer([
                one("PIPELINE_DURATION_P95", "t1", "DIMENSION", 4),
                one("PIPELINE_QUEUE_TIME", "t1", "DIMENSION", 4),
            ]),
        );
        await renderPage();
        expectNotReported("P95 Duration");
        expectNotReported("Queue Time");
    });

    it("W5 2+ teams and no ORG series: Not reported, never the pick-one-team state, never 0 or the mean 12", async () => {
        mockFetchTestOpsData.mockResolvedValue(
            answer([
                one("PIPELINE_DURATION_P95", "t1", "DIMENSION", 4),
                one("PIPELINE_DURATION_P95", "t2", "DIMENSION", 20),
                one("PIPELINE_QUEUE_TIME", "t1", "DIMENSION", 4),
                one("PIPELINE_QUEUE_TIME", "t2", "DIMENSION", 20),
            ]),
        );
        await renderPage(pick(["t1", "t2"]));
        expectNotReported("P95 Duration");
        expectNotReported("Queue Time");
        expect(screen.queryByText("Pick one team")).toBeNull();
    });

    it("W8 an ORG series with no bucket: Not reported, not 0", async () => {
        mockFetchTestOpsData.mockResolvedValue({
            ...answer([]),
            pipelines: {
                timeseries: [
                    {
                        dimension: "TEAM",
                        dimensionValue: "org",
                        scope: "ORG",
                        measure: "PIPELINE_DURATION_P95",
                        buckets: [],
                    },
                    {
                        dimension: "TEAM",
                        dimensionValue: "t1",
                        scope: "DIMENSION",
                        measure: "PIPELINE_DURATION_P95",
                        buckets: [{ date: "2026-11-13", value: 4 }],
                    },
                ],
                breakdowns: [],
            },
        });
        await renderPage();
        expectNotReported("P95 Duration");
    });
});
