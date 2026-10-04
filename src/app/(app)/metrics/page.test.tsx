/**
 * Pins the /metrics page (Flow) in the approved prototype layout (`flow(tab)`): header with the
 * per-tab subtitle and "View evidence", the tile set of each tab, the quadrant card with its
 * "Metric evidence" action, and the two association cards with an "Evidence" button each.
 * Server component: it is called as a function and its element tree is rendered, with its data
 * and shell parts mocked. The evidence drawer is the real shared provider.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const { tilesSpy, quadrantSpy, barSpy, panelSpy } = vi.hoisted(() => ({
    tilesSpy: vi.fn(),
    quadrantSpy: vi.fn(),
    barSpy: vi.fn(),
    panelSpy: vi.fn(),
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
        // The real panel places the caller's action in its head.
        return <div data-testid="quadrant-panel">{props.action as ReactNode}</div>;
    },
}));
// The request path of the shared drawer: this file checks which subject it is opened for.
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelSpy(props);
        return <div data-testid="evidence-panel" />;
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
const explainOverride = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/lib/api/home", () => ({
    getExplainData: async () => explainOverride.value ?? explain,
}));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: async () => null }));

import MetricsPage from "./page";

const renderTab = async (tab?: string) => {
    const ui = await MetricsPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
    return render(ui);
};

describe("/metrics in the approved prototype layout (CHAOS-8066)", () => {
    beforeEach(() => {
        tilesSpy.mockClear();
        quadrantSpy.mockClear();
        barSpy.mockClear();
        panelSpy.mockClear();
    });

    it("header: title Flow and the subtitle of the active tab; the legacy lines are gone", async () => {
        const subtitles: Record<string, string> = {
            dora: "Release speed and stability.",
            flow: "From idea to merge.",
            throughput: "Delivery volume and pacing.",
        };
        for (const [tab, subtitle] of Object.entries(subtitles)) {
            const { unmount } = await renderTab(tab);
            const header = within(screen.getByTestId("page-header"));
            expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Flow");
            expect(header.getByText(subtitle), tab).toBeInTheDocument();
            // The subtitle is in the header only: it is not drawn again under the tabs.
            expect(screen.getAllByText(subtitle), tab).toHaveLength(1);
            expect(screen.queryByText("Trends over the selected window.")).toBeNull();
            expect(screen.queryByText("Open a metric to investigate.")).toBeNull();
            unmount();
        }
    });

    it("header: one 'View evidence' action that opens the shared drawer for the tab's metric", async () => {
        await renderTab("flow");
        const actions = within(screen.getByTestId("page-header-actions"));
        expect(actions.getAllByRole("button")).toHaveLength(1);
        expect(screen.queryByTestId("evidence-panel")).toBeNull();

        await userEvent.click(actions.getByRole("button", { name: "View evidence" }));

        expect(screen.getByTestId("evidence-panel")).toBeInTheDocument();
        expect(panelSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            title: "Cycle Time",
            metric: "cycle_time",
        });
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

    it("tile sets and quadrants per tab (prototype sets and order; production quadrant data)", async () => {
        const expected: Record<string, { tiles: string[]; title: string; description: string }> = {
            dora: {
                tiles: ["deploy_freq", "cycle_time", "review_latency", "change_failure_rate"],
                title: "Churn × Throughput",
                description: "Operating modes under change volume and delivery pace.",
            },
            flow: {
                tiles: ["cycle_time", "review_latency", "wip_saturation", "blocked_work"],
                title: "Cycle Time × Throughput",
                description: "Coordination debt and delivery efficiency.",
            },
            throughput: {
                tiles: ["throughput", "wip_saturation", "blocked_work"],
                title: "WIP × Throughput",
                description: "Work-in-progress saturation and delivery capacity.",
            },
        };
        for (const [tab, want] of Object.entries(expected)) {
            tilesSpy.mockClear();
            quadrantSpy.mockClear();
            const { unmount } = await renderTab(tab);
            const tiles = tilesSpy.mock.calls[0][0] as { metrics: string[]; deltas: unknown };
            expect(tiles.metrics, tab).toEqual(want.tiles);
            // The tiles get the served rows unchanged: the page makes no number.
            expect(tiles.deltas, tab).toBe(deltas);
            const q = quadrantSpy.mock.calls[0][0] as {
                title: string;
                description: string;
                alwaysShowOverlayToggle?: boolean;
                showViewGuide?: boolean;
            };
            // CHAOS-8562: the overlay checkbox is always drawn and the guide is not switched off.
            expect(q.alwaysShowOverlayToggle, tab).toBe(true);
            expect(q.showViewGuide, tab).not.toBe(false);
            expect(q.title).toBe(want.title);
            expect(q.description).toBe(want.description);
            unmount();
        }
    });

    it("quadrant card action: 'Metric evidence' links to the evidence page of the tab's metric", async () => {
        const metricOfTab: Record<string, string> = {
            dora: "deploy_freq",
            flow: "cycle_time",
            throughput: "throughput",
        };
        for (const [tab, metric] of Object.entries(metricOfTab)) {
            const { unmount } = await renderTab(tab);
            const link = within(screen.getByTestId("quadrant-panel")).getByRole("link", {
                name: "Metric evidence",
            });
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.pathname, tab).toBe("/explore");
            expect(url.searchParams.get("metric"), tab).toBe(metric);
            unmount();
        }
    });

    it("has no free 'Open evidence' link above the tiles: the page's only links are the tabs and the quadrant action", async () => {
        await renderTab("flow");
        expect(screen.queryAllByRole("link", { name: "Open evidence" })).toHaveLength(0);
        const links = screen.getAllByRole("link").map((l) => l.textContent);
        expect(links).toEqual(["DORA", "Flow", "Throughput", "Metric evidence"]);
    });

    it("order: tabs, tiles, quadrant card, association cards", async () => {
        await renderTab("flow");
        const order = [
            screen.getByRole("navigation", { name: "Metrics views" }),
            screen.getByTestId("metric-tiles"),
            screen.getByTestId("quadrant-panel"),
            screen.getByTestId("association-cards"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(
                order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
                `block ${i} before block ${i + 1}`,
            ).toBeTruthy();
        }
    });

    it("association cards: two section cards side by side, each with title, description and bars only", async () => {
        await renderTab("flow");
        const cards = screen.getByTestId("association-cards");
        expect(cards.className).toContain("lg:grid-cols-2");
        const sections = Array.from(cards.querySelectorAll(":scope > section"));
        expect(sections).toHaveLength(2);

        const [associations, contributors] = sections.map((el) => within(el as HTMLElement));
        expect(
            associations.getByRole("heading", { level: 2, name: "Likely associations" }),
        ).toBeInTheDocument();
        expect(associations.getByText("Selected-window associations")).toBeInTheDocument();
        expect(
            contributors.getByRole("heading", { level: 2, name: "Primary contributors" }),
        ).toBeInTheDocument();
        expect(
            contributors.getByText("Where the impact concentrates in this window."),
        ).toBeInTheDocument();

        // Meter rows only: no axis chart, and the legacy link rows under each chart are gone
        // (they live in the drawer).
        expect(within(cards).queryAllByRole("link")).toHaveLength(0);
        expect(barSpy).not.toHaveBeenCalled();
        expect(associations.getByRole("list", { name: "Likely associations" })).toBeInTheDocument();
        expect(
            contributors.getByRole("list", { name: "Primary contributors" }),
        ).toBeInTheDocument();
    });

    it("association meter rows (K-5): signed from a zero line, a decrease to the left, an increase to the right; the value is the served signed change", async () => {
        await renderTab("flow");
        const rows = within(screen.getByTestId("association-meter-rows")).getAllByTestId(
            "meter-row",
        );
        expect(rows.map((row) => row.textContent)).toEqual(["repo-alpha-20%", "repo-beta+10%"]);
        const fills = rows.map((row) => within(row).getByTestId("meter-fill"));
        // |-20| is the largest, so it fills half the track (to the zero line); |+10| fills a quarter.
        expect(fills.map((f) => f.style.width)).toEqual(["50%", "25%"]);
        expect(fills.map((f) => f.getAttribute("data-direction"))).toEqual(["left", "right"]);
        within(screen.getByTestId("association-meter-rows")).getAllByTestId("meter-zero-line");
    });

    it("contributor meter rows: the served values with the served unit; the unit note is gone", async () => {
        await renderTab("flow");
        const rows = within(screen.getByTestId("contributor-meter-rows")).getAllByTestId(
            "meter-row",
        );
        expect(rows.map((row) => row.textContent)).toEqual(["repo-gamma7d"]);
        expect(within(rows[0]).getByTestId("meter-fill").style.width).toBe("100%");
    });

    it("data note: the unit and no causal conclusion under the associations only", async () => {
        await renderTab("flow");
        const [associations, contributors] = Array.from(
            screen.getByTestId("association-cards").querySelectorAll(":scope > section"),
        ).map((el) => within(el as HTMLElement));
        expect(associations.getByTestId("data-note")).toHaveTextContent(
            "Association values are percent change in the selected window; no causal conclusion is added.",
        );
        expect(contributors.queryByTestId("data-note")).toBeNull();
        expect(screen.queryByText(/per contributor, in/)).toBeNull();
        expect(screen.queryByText(/Preview of the selected window/)).toBeNull();
    });

    it("each card's 'Evidence' button opens the shared drawer for the tab's metric (one drawer, with the role)", async () => {
        const ui = await MetricsPage({
            searchParams: Promise.resolve({ tab: "flow", role: "manager" }),
        });
        render(ui);
        for (const name of ["Evidence: Likely associations", "Evidence: Primary contributors"]) {
            panelSpy.mockClear();
            await userEvent.click(screen.getByRole("button", { name }));
            expect(screen.getAllByTestId("evidence-panel")).toHaveLength(1);
            expect(panelSpy.mock.calls.at(-1)?.[0], name).toMatchObject({
                title: "Cycle Time",
                metric: "cycle_time",
                role: "manager",
            });
        }
    });

    it("has no Summary table: the tiles carry the same served values", async () => {
        for (const tab of ["dora", "flow", "throughput"]) {
            const { unmount } = await renderTab(tab);
            expect(screen.queryByRole("table"), tab).toBeNull();
            expect(screen.queryByRole("heading", { name: "Summary" }), tab).toBeNull();
            expect(screen.queryByText("Active window"), tab).toBeNull();
            unmount();
        }
    });

    it("empty explain data: both cards say so and draw no meter rows and no unit note", async () => {
        explainOverride.value = { ...explain, drivers: [], contributors: [] };
        try {
            await renderTab("flow");
            expect(screen.queryAllByTestId("meter-row")).toHaveLength(0);
            expect(
                screen.getByText("Association detail will appear once data is ingested."),
            ).toBeInTheDocument();
            expect(
                screen.getByText("Contributor detail will appear once data is ingested."),
            ).toBeInTheDocument();
            expect(screen.getAllByTestId("data-note")).toHaveLength(1);
        } finally {
            explainOverride.value = null;
        }
    });
});
