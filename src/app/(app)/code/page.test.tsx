import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const checkApiHealthMock = vi.fn();
const getHomeDataMock = vi.fn();
const getExplainDataMock = vi.fn();
const getHeatmapMock = vi.fn();
const getQuadrantMock = vi.fn();
const getBusFactorDataMock = vi.fn();

vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => <nav data-testid="primary-nav" />,
}));

vi.mock("@/components/navigation/GlobalContextBar", () => ({
    GlobalContextBar: () => <div data-testid="global-context" />,
}));

vi.mock("@/components/filters/FilterBar", () => ({
    FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({ label }: { label: string }) => <section>{label}</section>,
}));

vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: () => <section data-testid="heatmap-panel" />,
}));

vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <section data-testid="quadrant-panel" />,
}));

vi.mock("@/lib/api/system", () => ({
    checkApiHealth: () => checkApiHealthMock(),
}));

vi.mock("@/lib/api/home", () => ({
    getHomeData: (...args: unknown[]) => getHomeDataMock(...args),
    getExplainData: (...args: unknown[]) => getExplainDataMock(...args),
}));

vi.mock("@/lib/api/visuals", () => ({
    getHeatmap: (...args: unknown[]) => getHeatmapMock(...args),
    getQuadrant: (...args: unknown[]) => getQuadrantMock(...args),
}));

vi.mock("@/lib/api/code", () => ({
    getBusFactorData: (...args: unknown[]) => getBusFactorDataMock(...args),
}));

import CodePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    const ui = await CodePage({ searchParams: Promise.resolve(params) });
    render(ui as React.ReactElement);
}

describe("CodePage", () => {
    it("renders Ownership Patterns from bus-factor evidence when Git blame data exists", async () => {
        checkApiHealthMock.mockResolvedValue({ ok: true });
        getHomeDataMock.mockResolvedValue({ deltas: [] });
        getExplainDataMock.mockResolvedValue({ contributors: [], unit: "loc" });
        getHeatmapMock.mockResolvedValue(null);
        getQuadrantMock.mockResolvedValue(null);
        getBusFactorDataMock.mockResolvedValue({
            orgId: "org-1",
            scope: {},
            value: 1,
            evidenceSampleCount: 3773,
            topMaintainers: [
                { author: "chrisgeo@users.noreply.github.com", sharePercent: 98.8 },
                { author: "49699333+dependabot[bot]@users.noreply.github.com", sharePercent: 1.2 },
            ],
            repos: [
                {
                    repoId: "repo-1",
                    repoName: "full-chaos/dev-health-ops",
                    value: 1,
                    evidenceSampleCount: 1947,
                    topMaintainers: [
                        { author: "chrisgeo@users.noreply.github.com", sharePercent: 99.9 },
                    ],
                },
            ],
        });

        await renderPage();

        const card = screen.getByTestId("ownership-patterns-card");
        expect(
            within(card).getByRole("heading", { name: "Ownership Patterns" }),
        ).toBeInTheDocument();
        expect(within(card).getByText("Git blame")).toBeInTheDocument();
        expect(within(card).queryByText("Manual")).not.toBeInTheDocument();
        expect(within(card).getByText("chrisgeo@users.noreply.github.com")).toBeInTheDocument();
        expect(within(card).getByText("98.8%")).toBeInTheDocument();
        expect(within(card).getByText("3773 file-change samples")).toBeInTheDocument();
        expect(
            within(card).queryByText(
                /connect a git provider with commit history to surface ownership/i,
            ),
        ).not.toBeInTheDocument();
    });
});
