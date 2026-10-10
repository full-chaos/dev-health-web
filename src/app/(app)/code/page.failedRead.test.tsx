/**
 * /code, a FAILED Home read against an EMPTY Home answer (CHAOS-9189 in the describe name).
 * The real fetchOrNull and the real churn tile (MetricCard) are used: the test reads the drawn
 * text. Only the Home fetcher and the unrelated page parts are mocked. Only the churn tile and
 * the "Code Churn" page fact are fed by Home; the other tiles come from other reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const { getHome } = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/code",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="hotspot-bars" />,
}));
vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <section data-testid="heatmap-panel" />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <section data-testid="quadrant-panel" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: () => <div data-testid="evidence-panel" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: getHome }));
vi.mock("@/lib/api/home", () => ({
    getExplainData: async () => ({ contributors: [], unit: "loc" }),
}));
vi.mock("@/lib/api/visuals", () => ({
    getHeatmap: async () => null,
    getQuadrant: async () => null,
}));
vi.mock("@/lib/api/code", () => ({
    getBusFactorData: async () => null,
    getRepoTopHotspots: async () => null,
}));

import CodePage from "./page";

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
            metric: "churn",
            label: "Code Churn",
            value: 4321,
            unit: "loc",
            delta_pct: 5,
            spark: [],
        },
    ],
};

const draw = async () => render(await CodePage({ searchParams: Promise.resolve({}) }));
const churnTile = () => within(screen.getByTestId("code-tiles")).getAllByTestId("metric-value")[0];
const churnFact = async () => {
    await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
    const rows = within(await screen.findByTestId("page-evidence-facts")).getAllByTestId(
        "evidence-fact",
    );
    return rows[0];
};

describe("/code when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        getHome.mockReset();
    });

    it("failed read: the churn tile and the 'Code Churn' fact say 'Could not be read', and no backend text", async () => {
        getHome.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        await draw();

        expect(churnTile()).toHaveTextContent(/^Could not be read$/);
        expect(churnTile()).not.toHaveTextContent(/Not reported|No data for this window/);

        const fact = await churnFact();
        expect(fact).toHaveTextContent("Code Churn");
        expect(fact).toHaveTextContent("Could not be read");
        expect(fact).not.toHaveTextContent("Unknown");
        expect(document.body.textContent).not.toContain("Service Unavailable");
    });

    it("empty answer: the churn tile says 'Not reported', the fact is unserved, and never 'Could not be read'", async () => {
        getHome.mockResolvedValue(emptyHome);
        await draw();

        expect(churnTile()).toHaveTextContent(/^Not reported$/);

        const fact = await churnFact();
        expect(fact).toHaveTextContent("Code Churn");
        // An unserved fact is drawn as "Unknown" (the fact row has its own wording).
        expect(fact).toHaveTextContent("Unknown");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: the served churn is drawn and nothing says 'Could not be read'", async () => {
        getHome.mockResolvedValue(servedHome);
        await draw();

        expect(churnTile()).toHaveTextContent("4.3K LOC");

        const fact = await churnFact();
        expect(fact).toHaveTextContent("Code Churn4.3K");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
