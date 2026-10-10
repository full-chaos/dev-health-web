import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { describe, expect, it, vi } from "vitest";

const checkApiHealthMock = vi.fn();
const getHomeDataMock = vi.fn();
const getExplainDataMock = vi.fn();
const getHeatmapMock = vi.fn();
const getQuadrantMock = vi.fn();
const getBusFactorDataMock = vi.fn();
const getRepoTopHotspotsMock = vi.fn();

vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: () => <div data-testid="scope-bar" />,
}));

vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="hotspot-bars" />,
}));

vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <section data-testid="heatmap-panel" />,
}));

const timeseriesSpy = vi.fn();
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: (props: unknown) => {
        timeseriesSpy(props);
        return <div data-testid="timeseries-chart" />;
    },
}));

vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <section data-testid="quadrant-panel" />,
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: () => checkApiHealthMock(),
}));

vi.mock("@/lib/api/home", () => ({
    getExplainData: (...args: unknown[]) => getExplainDataMock(...args),
}));

vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: (...args: unknown[]) => getHomeDataMock(...args),
}));

vi.mock("@/lib/api/visuals", () => ({
    getHeatmap: (...args: unknown[]) => getHeatmapMock(...args),
    getQuadrant: (...args: unknown[]) => getQuadrantMock(...args),
}));

vi.mock("@/lib/api/code", () => ({
    getBusFactorData: (...args: unknown[]) => getBusFactorDataMock(...args),
    getRepoTopHotspots: (...args: unknown[]) => getRepoTopHotspotsMock(...args),
}));

import CodePage from "./page";

const churn = (extra: Record<string, unknown>) => ({
    metric: "churn",
    label: "Code Churn",
    value: 0,
    unit: "loc",
    delta_pct: 0,
    spark: [],
    ...extra,
});

async function renderTile(extra: Record<string, unknown>) {
    checkApiHealthMock.mockResolvedValue({ ok: true });
    getHomeDataMock.mockResolvedValue({ deltas: [churn(extra)] });
    getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
    getHeatmapMock.mockResolvedValue(null);
    getQuadrantMock.mockResolvedValue(null);
    getBusFactorDataMock.mockResolvedValue(null);
    getRepoTopHotspotsMock.mockResolvedValue(null);
    const ui = await CodePage({ searchParams: Promise.resolve({}) });
    render(ui as React.ReactElement);
    return within(screen.getByTestId("code-tiles"))
        .getAllByTestId("metric-value")[0]
        .closest("section, article, div")!;
}

describe("CodePage churn tile — no data", () => {
    it("has_data false: 'No data for this window', no 0, no change", async () => {
        const tile = await renderTile({ has_data: false });
        const value = within(tile.parentElement!).getAllByTestId("metric-value")[0];
        expect(value).toHaveTextContent(/^No data for this window$/);
        expect(screen.queryAllByTestId("metric-delta")).toHaveLength(0);
    });

    it("has_prior_data false: the value and 'No prior period', never '0%' or 'No change'", async () => {
        await renderTile({ has_prior_data: false, value: 5 });
        const strip = screen.getByTestId("code-tiles");
        expect(within(strip).getAllByTestId("metric-value")[0]).toHaveTextContent("5");
        expect(within(strip).getAllByText("No prior period").length).toBeGreaterThan(0);
        expect(within(strip).queryAllByTestId("metric-delta")).toHaveLength(0);
        expect(strip.textContent).not.toMatch(/0%/);
        expect(strip.textContent).not.toMatch(/No change/);
    });

    it("a measured 0 with data in both windows is still drawn as 0", async () => {
        await renderTile({ has_data: true, has_prior_data: true });
        const strip = screen.getByTestId("code-tiles");
        expect(within(strip).getAllByTestId("metric-value")[0]).toHaveTextContent(/^0\s*LOC$/);
        expect(within(strip).getAllByTestId("metric-delta")).toHaveLength(1);
    });
});

// CHAOS-9154: a served bus factor row with 0 samples is a no-data state, not the fact "0".
describe("CodePage File-change samples tile (CHAOS-9154)", () => {
    const busFactor = (evidenceSampleCount: number) => ({
        orgId: "org-1",
        scope: {},
        value: evidenceSampleCount > 0 ? 2 : 0,
        evidenceSampleCount,
        topMaintainers: [],
        repos: [],
    });

    async function renderSamples(count: number) {
        checkApiHealthMock.mockResolvedValue({ ok: true });
        getHomeDataMock.mockResolvedValue({ deltas: [] });
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getHeatmapMock.mockResolvedValue(null);
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue(busFactor(count));
        getRepoTopHotspotsMock.mockResolvedValue([]);
        const ui = await CodePage({ searchParams: Promise.resolve({}) });
        render(ui as React.ReactElement);
        // Tiles in order: churn, File-change samples, Bus factor.
        return within(screen.getByTestId("code-tiles"));
    }

    it("0 samples: 'No data for this window', no 0", async () => {
        const tile = await renderSamples(0);
        const value = tile.getAllByTestId("metric-value")[1];
        expect(value).toHaveTextContent("No data for this window");
        expect(value).toHaveAttribute("data-value-kind", "message");
    });

    it("samples above 0: the number is drawn as a value", async () => {
        const tile = await renderSamples(3773);
        const value = tile.getAllByTestId("metric-value")[1];
        expect(value).toHaveTextContent("3,773");
        expect(value).toHaveAttribute("data-value-kind", "value");
    });
});
