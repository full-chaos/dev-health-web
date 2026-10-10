/**
 * /investment, a FAILED Home read against an EMPTY Home answer (CHAOS-9189 in the describe name).
 * The real page, the real fetchOrNull and the real Confidence tiles are used: the test reads the
 * drawn rework tile. Only the Home fetcher, the data hooks and the charts are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen, within } from "@/test/utils";

const { home, uq } = vi.hoisted(() => ({ home: vi.fn(), uq: { mode: "empty" as string } }));
vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/investment",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: home }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "org-1" } }),
    getOrgEntitlements: async () => ({ data: { features: { investment_view: true } } }),
}));
vi.mock("@/lib/api/investment", () => ({
    getWorkUnits: async () => [],
    getWorkUnitExplanation: async () => null,
    explainInvestmentMix: async () => {
        throw new Error("no data");
    },
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1", useSsr: () => null }));
vi.mock("urql", () => ({
    useQuery: () => {
        if (uq.mode === "nodata")
            return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
        if (uq.mode === "loading")
            return [{ data: undefined, fetching: true, error: undefined }, vi.fn()];
        return [
            {
                data: {
                    analytics: {
                        breakdowns: [
                            { dimension: "THEME", items: [] },
                            { dimension: "SUBCATEGORY", items: [] },
                        ],
                        sankey: { nodes: [], edges: [] },
                        evidenceQualityDistribution: {},
                        evidenceQualityStats: null,
                    },
                    workUnitTeamAttributions: [],
                    workItemTeamAttributions: [],
                },
                fetching: false,
                error: undefined,
            },
            vi.fn(),
        ];
    },
}));
vi.mock("@/lib/graphql/hooks/useChordFlow", () => ({
    useChordFlow: () => ({ data: null, fetching: false, error: undefined }),
}));
vi.mock("@/components/charts/TreemapChart", () => ({
    TreemapChart: () => <div data-testid="treemap-chart" />,
}));
vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div data-testid="sankey-chart" />,
}));
vi.mock("@/components/charts/InvestmentMixSunburst", () => ({
    InvestmentMixSunburst: () => <div data-testid="sunburst-chart" />,
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

if (!window.matchMedia)
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({
            matches: false,
            media: q,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            onchange: null,
            dispatchEvent: () => false,
        }),
    });
import Page from "./page";

const row = (over: object) => ({
    metric: "pr_rework_ratio",
    label: "PR Rework Ratio",
    unit: "%",
    value: 12,
    delta_pct: 4,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});
const drawTile = async () => {
    uq.mode = "empty";
    const ui = await Page({ searchParams: Promise.resolve({ tab: "confidence" }) });
    render(ui);
    return within(screen.getByTestId("confidence-tile-rework"));
};

describe("Investment rework tile when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        home.mockReset();
        cleanup();
    });

    it("failed read: the rework tile says 'Could not be read', not a no-data text, and no backend text", async () => {
        home.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        const tile = await drawTile();

        expect(tile.getByTestId("metric-value")).toHaveTextContent(/^Could not be read$/);
        expect(tile.queryByText(/No data for this window|Not reported/)).toBeNull();
        expect(tile.queryByText("Rework signal not available yet")).toBeNull();
        expect(document.body.textContent).not.toContain("Service Unavailable");
    });

    it("empty answer: the rework tile draws its no-data text and never 'Could not be read'", async () => {
        home.mockResolvedValue({ deltas: [], rework_theme_allocation: [] });
        const tile = await drawTile();

        expect(tile.getByTestId("metric-value")).toHaveTextContent("No data for this window");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: the served rework value is drawn and nothing says 'Could not be read'", async () => {
        home.mockResolvedValue({ deltas: [row({})], rework_theme_allocation: [] });
        const tile = await drawTile();

        expect(tile.getByTestId("metric-value")).toHaveTextContent("12");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
