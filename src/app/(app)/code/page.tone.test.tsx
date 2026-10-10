import { screen, within } from "@testing-library/react";
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

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

// CHAOS-9077: the churn tile (lower is better) draws its change by polarity, not by sign.
async function renderChurn(delta_pct: number) {
    checkApiHealthMock.mockResolvedValue({ ok: true });
    getHomeDataMock.mockResolvedValue({
        deltas: [
            {
                metric: "churn",
                label: "Code Churn",
                value: 10,
                unit: "loc",
                delta_pct,
                spark: [],
                has_data: true,
                has_prior_data: true,
            },
        ],
    });
    getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
    getHeatmapMock.mockResolvedValue(null);
    getQuadrantMock.mockResolvedValue(null);
    getBusFactorDataMock.mockResolvedValue(null);
    getRepoTopHotspotsMock.mockResolvedValue(null);
    const ui = await CodePage({ searchParams: Promise.resolve({}) });
    render(ui as React.ReactElement);
    return within(screen.getByTestId("code-tiles")).getByTestId("metric-delta");
}

describe("CodePage churn tile change tone follows polarity", () => {
    it("churn falling is good", async () => {
        const el = await renderChurn(-3);
        expect(el).toHaveClass(GOOD);
        expect(el).not.toHaveClass(BAD);
    });

    it("churn rising is bad", async () => {
        const el = await renderChurn(3);
        expect(el).toHaveClass(BAD);
        expect(el).not.toHaveClass(GOOD);
    });
});
