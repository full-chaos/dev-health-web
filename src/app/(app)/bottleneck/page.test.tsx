/**
 * The Bottlenecks page in the approved prototype layout (`bottlenecks()`, view 27, CHAOS-8070):
 * "View evidence" in the header, one strip of three tiles that open the shared drawer, the WIP
 * note, ONE quadrant (Review Load × Review Latency), the review wait heatmap and the WIP
 * associations as meter rows. Server component: called as a function, its element tree rendered
 * with the data and the shell parts mocked; the evidence drawer is the real shared provider.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const { quadrantSpy, heatmapSpy, panelSpy, quadrantRequests } = vi.hoisted(() => ({
    quadrantSpy: vi.fn(),
    heatmapSpy: vi.fn(),
    panelSpy: vi.fn(),
    quadrantRequests: [] as Array<{ type: string }>,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: (props: Record<string, unknown>) => {
        quadrantSpy(props);
        return <div data-testid="quadrant-panel">{props.title as ReactNode}</div>;
    },
}));
vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: (props: Record<string, unknown>) => {
        heatmapSpy(props);
        return <div data-testid="heatmap-panel">{props.title as ReactNode}</div>;
    },
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelSpy(props);
        return <div data-testid="evidence-panel" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

const deltas = [
    {
        metric: "wip_saturation",
        label: "WIP Saturation",
        value: 298,
        unit: "%",
        delta_pct: -30,
        spark: [],
    },
    {
        metric: "blocked_work",
        label: "Blocked Work",
        value: 0,
        unit: "hours",
        delta_pct: 0,
        spark: [],
    },
    {
        metric: "review_latency",
        label: "Review Latency",
        value: 0.3,
        unit: "hours",
        delta_pct: 258,
        spark: [],
    },
];
const homeOverride = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: async () => homeOverride.value ?? { deltas },
}));
const wipExplain = {
    metric: "wip_saturation",
    label: "WIP Saturation",
    unit: "%",
    value: 298,
    delta_pct: -30,
    drivers: [
        { id: "t1", label: "Unassigned", value: 1, delta_pct: 15, evidence_link: "/x?1" },
        { id: "t2", label: "Fullchaos", value: 1, delta_pct: 8, evidence_link: "/x?2" },
        { id: "t3", label: "Ops Team", value: 1, delta_pct: 0, evidence_link: "/x?3" },
    ],
    contributors: [],
    drilldown_links: {},
};
const explainOverride = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/lib/api/home", () => ({
    getExplainData: async ({ metric }: { metric: string }) =>
        metric === "wip_saturation" ? (explainOverride.value ?? wipExplain) : null,
}));
vi.mock("@/lib/api/visuals", () => ({
    getQuadrant: async (request: { type: string }) => {
        quadrantRequests.push(request);
        return null;
    },
    getHeatmap: async () => null,
}));

import BottleneckPage from "./page";

const draw = async (params: Record<string, string> = {}) =>
    render(await BottleneckPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
    quadrantSpy.mockClear();
    heatmapSpy.mockClear();
    panelSpy.mockClear();
    quadrantRequests.length = 0;
    homeOverride.value = null;
    explainOverride.value = null;
});

describe("/bottleneck in the approved prototype layout (CHAOS-8070)", () => {
    it("header: production title and subtitle, ONE action 'View evidence'; no extra line", async () => {
        await draw();
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Bottlenecks");
        expect(
            header.getByText("WIP saturation, review latency, and blocked work in one view."),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Where work is piling up and review is slowing delivery."),
        ).toBeNull();
        const actions = within(screen.getByTestId("page-header-actions"));
        expect(actions.getAllByRole("button")).toHaveLength(1);
        expect(actions.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
    });

    it("View evidence lists the three served tile values (the page is the subject)", async () => {
        await draw();
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        const rows = within(screen.getByTestId("page-evidence-facts")).getAllByTestId(
            "evidence-fact",
        );
        expect(rows.map((row) => row.textContent)).toEqual([
            "WIP Saturation298%",
            "Blocked Work0 hours",
            "Review Latency0.3 hours",
        ]);
        expect(panelSpy).not.toHaveBeenCalled();
    });

    it("tiles: one strip of three, in prototype order, with the production captions", async () => {
        await draw();
        const strip = screen.getByTestId("bottleneck-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        const tiles = strip.querySelectorAll(":scope > article");
        expect(Array.from(tiles).map((tile) => tile.getAttribute("data-testid"))).toEqual([
            "bottleneck-tile-wip_saturation",
            "bottleneck-tile-blocked_work",
            "bottleneck-tile-review_latency",
        ]);
        expect(strip).toHaveTextContent("Work in progress");
        expect(strip).toHaveTextContent("Blocked items");
        expect(strip).toHaveTextContent("Time to first review");
    });

    it("Review Latency is lower-is-better: its +258% reads in the negative tone, as on Flow", async () => {
        await draw();
        const review = screen.getByTestId("bottleneck-tile-review_latency");
        const delta = within(review).getByTestId("metric-delta");
        expect(delta).toHaveTextContent("+258%");
        expect(delta.className).toContain("text-(--accent-negative)");
        expect(delta.className).not.toContain("text-(--positive)");
        // WIP Saturation is lower-is-better too: its -30% reads good.
        const wip = within(screen.getByTestId("bottleneck-tile-wip_saturation")).getByTestId(
            "metric-delta",
        );
        expect(wip.className).toContain("text-(--positive)");
    });

    it("a tile opens the shared drawer for its metric, with this page as the way back", async () => {
        await draw({ role: "manager" });
        await userEvent.click(
            screen.getByRole("button", { name: "Review Latency: Open evidence" }),
        );
        const props = panelSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(props).toMatchObject({ metric: "review_latency", role: "manager" });
        const origin = new URL(String(props.origin), "https://app.example");
        expect(origin.pathname).toBe("/bottleneck");
        expect(origin.searchParams.get("role")).toBe("manager");
        // No tile is a link to Explore any more: the drawer footer is the one way there.
        expect(within(screen.getByTestId("bottleneck-tiles")).queryAllByRole("link")).toHaveLength(
            0,
        );
    });

    it("the WIP note keeps its production text (D7)", async () => {
        await draw();
        expect(screen.getByTestId("wip-saturation-notice")).toHaveTextContent(
            "intentionally uncapped so that severity stays visible",
        );
    });

    it("ONE quadrant: Review Load × Review Latency, with its Explore work link; WIP × Throughput is not read", async () => {
        await draw();
        expect(quadrantSpy).toHaveBeenCalledTimes(1);
        const props = quadrantSpy.mock.calls[0][0] as {
            title: string;
            relatedLinks: Array<{ label: string }>;
            alwaysShowOverlayToggle?: boolean;
            showViewGuide?: boolean;
        };
        // CHAOS-8562: the overlay checkbox is always drawn and the guide is not switched off.
        expect(props.alwaysShowOverlayToggle).toBe(true);
        expect(props.showViewGuide).not.toBe(false);
        expect(props.title).toBe("Review Load × Review Latency");
        expect(props.relatedLinks.map((link) => link.label)).toEqual(["Explore work"]);
        expect(quadrantRequests.map((request) => request.type)).toEqual(["review_load_latency"]);
    });

    it("WIP associations: meter rows of the served drivers (|change| fill, signed value) and an Evidence button", async () => {
        await draw({ role: "manager" });
        const section = screen.getByTestId("wip-associations");
        expect(
            within(section).getByRole("heading", { level: 2, name: "WIP associations" }),
        ).toBeInTheDocument();
        const rows = within(section).getAllByTestId("meter-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "Unassigned+15%",
            "Fullchaos+8%",
            "Ops Team0%",
        ]);
        expect(within(rows[2]).queryByTestId("meter-fill")).toBeNull();
        // The legacy link rows went to the drawer.
        expect(within(section).queryAllByRole("link")).toHaveLength(0);
        await userEvent.click(
            within(section).getByRole("button", { name: "Evidence: WIP associations" }),
        );
        expect(panelSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            metric: "wip_saturation",
            role: "manager",
        });
    });

    it("no Blocked Associations card and no legacy WIP Associations card", async () => {
        await draw();
        expect(screen.queryByText("Blocked Associations")).toBeNull();
        expect(screen.queryByText("WIP Associations")).toBeNull();
        expect(screen.queryByText("Inspect associations")).toBeNull();
    });

    it("order: tiles, note, quadrant, heatmap, WIP associations", async () => {
        await draw();
        const order = [
            screen.getByTestId("bottleneck-tiles"),
            screen.getByTestId("wip-saturation-notice"),
            screen.getByTestId("quadrant-panel"),
            screen.getByTestId("heatmap-panel"),
            screen.getByTestId("wip-associations"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(
                order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
                `block ${i}`,
            ).toBeTruthy();
        }
    });

    it("no served rows: tiles say 'Not reported', facts draw no row, associations say data will appear", async () => {
        homeOverride.value = { deltas: [] };
        explainOverride.value = { ...wipExplain, drivers: [] };
        await draw();
        expect(
            within(screen.getByTestId("bottleneck-tile-review_latency")).getByTestId(
                "metric-value",
            ),
        ).toHaveTextContent(/^Not reported$/);
        expect(
            screen.getByText("WIP association detail will appear once data is ingested."),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        const rows = within(screen.getByTestId("page-evidence-facts")).queryAllByTestId(
            "evidence-fact",
        );
        expect(rows).toHaveLength(0);
    });
});
