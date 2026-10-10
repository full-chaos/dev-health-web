import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen, within } from "@/test/utils";

const { home, uq } = vi.hoisted(() => ({ home: vi.fn(), uq: { mode: "empty" as string } }));
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

// CHAOS-9133: an empty (or missing) Home deltas list draws the no-data text on the Rework tile.
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
const tile = async (home_: unknown) => {
    uq.mode = "empty";
    home.mockResolvedValue(home_);
    const ui = await Page({ searchParams: Promise.resolve({ tab: "confidence" }) });
    render(ui);
    return within(screen.getByTestId("confidence-tile-rework")).getByTestId("metric-value");
};

describe("Investment Rework tile with no served row", () => {
    beforeEach(() => {
        home.mockReset();
        cleanup();
    });
    it.each([
        ["deltas []", { deltas: [], rework_theme_allocation: [] }],
        ["home null", null],
        [
            "deltas without the metric",
            { deltas: [row({ metric: "throughput", label: "T" })], rework_theme_allocation: [] },
        ],
    ])("%s draws No data for this window", async (_n, h) => {
        const el = await tile(h);
        expect(el).toHaveTextContent("No data for this window");
        expect(el.textContent).not.toMatch(/\b0\s*%|^0/);
    });
    it("a served row with data still draws its value", async () => {
        const el = await tile({ deltas: [row({})], rework_theme_allocation: [] });
        expect(el).toHaveTextContent("12");
    });
});
