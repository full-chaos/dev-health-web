/**
 * Pins the /metrics page (Flow) as it is: header, the per-tab strip with its chips, the tile sets,
 * the three quadrants, the two association cards and the Summary table. Server component: it is
 * called as a function and its element tree is rendered, with its data and shell parts mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

const { tilesSpy, quadrantSpy, barSpy } = vi.hoisted(() => ({
    tilesSpy: vi.fn(),
    quadrantSpy: vi.fn(),
    barSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/metrics",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: (props: Record<string, unknown>) => {
        quadrantSpy(props);
        return <div data-testid="quadrant-panel" />;
    },
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: (props: Record<string, unknown>) => {
        barSpy(props);
        return <div data-testid="bar-chart" />;
    },
}));
vi.mock("@/components/metrics/MetricEvidenceCards", () => ({
    MetricEvidenceCards: (props: Record<string, unknown>) => {
        tilesSpy(props);
        return <div data-testid="metric-tiles" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

const deltas = [
    {
        metric: "cycle_time",
        label: "Cycle Time",
        value: 4.2,
        unit: "days",
        delta_pct: -12,
        spark: [],
    },
    {
        metric: "review_latency",
        label: "Review Latency",
        value: 6,
        unit: "hours",
        delta_pct: 30,
        spark: [],
    },
    {
        metric: "throughput",
        label: "Throughput",
        value: 50,
        unit: "items",
        delta_pct: 5,
        spark: [],
    },
    {
        metric: "wip_saturation",
        label: "WIP Saturation",
        value: 120,
        unit: "%",
        delta_pct: 8,
        spark: [],
    },
    {
        metric: "deploy_freq",
        label: "Deploy Frequency",
        value: 9,
        unit: "deploys",
        delta_pct: 0,
        spark: [],
    },
    {
        metric: "change_failure_rate",
        label: "Change Failure Rate",
        value: 3,
        unit: "%",
        delta_pct: -1,
        spark: [],
    },
    {
        metric: "blocked_work",
        label: "Blocked Work",
        value: 2,
        unit: "hours",
        delta_pct: 4,
        spark: [],
    },
];
const explain = {
    metric: "cycle_time",
    label: "Cycle Time",
    unit: "days",
    value: 4.2,
    delta_pct: -12,
    drivers: [
        {
            id: "d1",
            label: "repo-alpha",
            value: 3,
            delta_pct: -20,
            evidence_link: "/api/v1/drilldown/prs?x=1",
        },
        {
            id: "d2",
            label: "repo-beta",
            value: 2,
            delta_pct: 10,
            evidence_link: "/api/v1/drilldown/prs?x=2",
        },
    ],
    contributors: [
        {
            id: "c1",
            label: "repo-gamma",
            value: 7,
            delta_pct: 1,
            evidence_link: "/api/v1/drilldown/prs?x=3",
        },
    ],
    drilldown_links: {},
};

vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: async () => ({ deltas }),
}));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => explain }));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: async () => null }));

import MetricsPage from "./page";

const renderTab = async (tab?: string) => {
    const ui = await MetricsPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
    return render(ui);
};

describe("/metrics today", () => {
    beforeEach(() => {
        tilesSpy.mockClear();
        quadrantSpy.mockClear();
        barSpy.mockClear();
    });

    it("header: title Flow, subtitle and the investigate line", async () => {
        await renderTab("flow");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Flow");
        expect(screen.getByText("Trends over the selected window.")).toBeInTheDocument();
        expect(screen.getByText("Open a metric to investigate.")).toBeInTheDocument();
    });

    it("three tabs, the active one marked", async () => {
        await renderTab("flow");
        const tabs = screen.getByRole("navigation", { name: "Metrics views" });
        expect(
            within(tabs)
                .getAllByRole("link")
                .map((l) => l.textContent),
        ).toEqual(["DORA", "Flow", "Throughput"]);
    });

    it("tile sets and quadrants per tab (production sets and names)", async () => {
        const expected: Record<string, { tiles: string[]; title: string; description: string }> = {
            dora: {
                tiles: ["deploy_freq", "cycle_time", "change_failure_rate", "review_latency"],
                title: "Churn × Throughput landscape",
                description: "Operating modes under change volume and delivery pace.",
            },
            flow: {
                tiles: ["cycle_time", "review_latency", "throughput", "wip_saturation"],
                title: "Cycle Time × Throughput landscape",
                description: "Coordination debt and delivery efficiency.",
            },
            throughput: {
                tiles: ["throughput", "deploy_freq", "wip_saturation", "blocked_work"],
                title: "WIP × Throughput landscape",
                description: "Work-in-progress saturation and delivery capacity.",
            },
        };
        for (const [tab, want] of Object.entries(expected)) {
            tilesSpy.mockClear();
            quadrantSpy.mockClear();
            const { unmount } = await renderTab(tab);
            expect((tilesSpy.mock.calls[0][0] as { metrics: string[] }).metrics).toEqual(
                want.tiles,
            );
            const q = quadrantSpy.mock.calls[0][0] as { title: string; description: string };
            expect(q.title).toBe(want.title);
            expect(q.description).toBe(want.description);
            unmount();
        }
    });

    it("tab description under the tabs; Open evidence (highlight metric) above the tiles; no chip row, no strip eyebrow", async () => {
        await renderTab("flow");
        expect(screen.getByText("From idea to merge.")).toBeInTheDocument();
        expect(screen.queryByText("Flow monitoring")).toBeNull();
        const open = screen.getAllByRole("link", { name: "Open evidence" })[0];
        expect(open.getAttribute("href")).toContain("metric=cycle_time");
        expect(open.getAttribute("title")).toBe("Open evidence for Cycle Time");
        // the chips were links with these labels in a rounded-full pill: none is left
        const pills = screen
            .queryAllByRole("link")
            .filter((l) => l.className.includes("rounded-full"));
        expect(pills).toHaveLength(0);
    });

    it("description sits after the tab row and before the tiles", async () => {
        await renderTab("flow");
        const tabs = screen.getByRole("navigation", { name: "Metrics views" });
        const description = screen.getByText("From idea to merge.");
        const tiles = screen.getByTestId("metric-tiles");
        expect(
            tabs.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            description.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("Likely associations and Primary contributors: bars of |delta|, link rows, signed delta", async () => {
        await renderTab("flow");
        expect(screen.getByText("Likely associations")).toBeInTheDocument();
        expect(screen.getByText("Primary contributors")).toBeInTheDocument();
        expect(barSpy.mock.calls[0][0]).toMatchObject({ values: [20, 10] });
        expect(screen.getByText("repo-alpha")).toBeInTheDocument();
        expect(screen.getByText("repo-gamma")).toBeInTheDocument();
    });

    it("Summary table: Metric / Current / Delta / Explore, one row per tab metric", async () => {
        await renderTab("flow");
        const table = screen.getByRole("table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((h) => h.textContent),
        ).toEqual(["Metric", "Current", "Delta", "Explore"]);
        const rows = within(table).getAllByRole("row").slice(1);
        expect(rows).toHaveLength(4);
        expect(rows[0]).toHaveTextContent("Cycle Time");
        expect(rows[0]).toHaveTextContent("4.2d");
        expect(rows[0]).toHaveTextContent("-12%");
        expect(rows[0]).toHaveTextContent("Open evidence");
        for (const link of within(rows[0]).getAllByRole("link")) {
            expect(link.getAttribute("href")).toContain("metric=cycle_time");
        }
    });
});
