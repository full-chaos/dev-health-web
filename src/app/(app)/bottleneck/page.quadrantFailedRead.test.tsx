/**
 * /bottleneck with a FAILED quadrant read (team scope, the default filter). The real fetchOrNull and
 * the real QuadrantPanel draw the answer: a failed read says so, it is not the "no data yet" state.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));
vi.mock("@/components/charts/InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
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
vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: async () => ({ deltas: [] }),
}));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/lib/ask-dev/load-page-scope-entities", () => ({
    loadScopePageEntities: async () => [],
}));
vi.mock("@/lib/api/visuals", () => ({
    getQuadrant: async () => {
        throw new Error("quadrant read failed");
    },
    getHeatmap: async () => null,
}));

import BottleneckPage from "./page";

describe("Bottlenecks: a failed quadrant read", () => {
    beforeAll(() => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                matches: false,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        });
    });

    it("the Review Load × Review Latency panel says the read failed, not 'no data yet'", async () => {
        render(await BottleneckPage({ searchParams: Promise.resolve({}) }));

        const panel = screen.getByTestId("quadrant-panel");
        expect(panel.textContent).not.toContain("will appear once PR data is ingested");
        expect(panel.textContent).toContain(READ_FAILED_MESSAGE);
    });
});
