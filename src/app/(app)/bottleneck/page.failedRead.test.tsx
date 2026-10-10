/**
 * /bottleneck, a FAILED Home read against an EMPTY Home answer (CHAOS-9189 in the describe name).
 * The real fetchOrNull and the real tiles (BottleneckTiles, MetricCard) are used: the test reads
 * the drawn text. Only the Home fetcher and the unrelated page parts are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const { getHome } = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <div data-testid="quadrant-panel" />,
}));
vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <div data-testid="heatmap-panel" />,
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: () => <div data-testid="evidence-panel" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: getHome }));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/lib/api/visuals", () => ({
    getQuadrant: async () => null,
    getHeatmap: async () => null,
}));

import BottleneckPage from "./page";

const emptyHome = {
    freshness: {},
    deltas: [],
    summary: [],
    tiles: {},
    constraint: null,
    events: [],
};

const servedHome = {
    ...emptyHome,
    deltas: [
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
            value: 5,
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
    ],
};

const draw = async () => render(await BottleneckPage({ searchParams: Promise.resolve({}) }));
const tiles = () => within(screen.getByTestId("bottleneck-tiles"));
const openFacts = async () => {
    await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
    return within(screen.getByTestId("page-evidence-facts"));
};

describe("/bottleneck when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        getHome.mockReset();
    });

    it("failed read: tiles and page facts say 'Could not be read', not 'Not reported', and no backend text", async () => {
        getHome.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        await draw();

        expect(tiles().getAllByText("Could not be read")).toHaveLength(3);
        expect(tiles().queryByText(/Not reported/)).toBeNull();
        expect(tiles().queryByText(/No data for this window/)).toBeNull();

        const facts = await openFacts();
        const rows = facts.getAllByTestId("evidence-fact");
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(row).toHaveTextContent("Could not be read");
        }
        expect(document.body.textContent).not.toContain("Service Unavailable");
    });

    it("empty answer: tiles say 'Not reported' and never 'Could not be read'", async () => {
        getHome.mockResolvedValue(emptyHome);
        await draw();

        expect(tiles().getAllByText("Not reported")).toHaveLength(3);
        expect(screen.queryByText("Could not be read")).toBeNull();

        const facts = await openFacts();
        expect(facts.getAllByTestId("evidence-fact")).toHaveLength(3);
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: a served value is drawn and nothing says 'Could not be read'", async () => {
        getHome.mockResolvedValue(servedHome);
        await draw();

        expect(tiles().getByText(/298/)).toBeInTheDocument();
        expect(screen.queryByText("Could not be read")).toBeNull();

        const facts = await openFacts();
        expect(facts.getAllByTestId("evidence-fact")[0]).toHaveTextContent("WIP Saturation298%");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
