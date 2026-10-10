/**
 * /metrics, a FAILED Home read against an EMPTY Home answer (CHAOS-9189 in the describe name).
 * The real fetchOrNull and the real tiles (MetricEvidenceCards, MetricCard) are used: the test
 * reads the drawn text. Only the Home fetcher and the unrelated page parts are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

const { getHome } = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/metrics",
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
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: () => <div data-testid="evidence-panel" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: getHome }));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: async () => null }));

import MetricsPage from "./page";

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
            metric: "wip_saturation",
            label: "WIP Saturation",
            value: 120,
            unit: "%",
            delta_pct: 8,
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
    ],
};

const renderFlow = async () => {
    const ui = await MetricsPage({ searchParams: Promise.resolve({ tab: "flow" }) });
    return render(ui);
};
const strip = () => within(screen.getByTestId("metric-tile-strip"));

describe("/metrics when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        getHome.mockReset();
    });

    it("failed read: every tile says 'Could not be read', not 'Not reported', and no backend text", async () => {
        getHome.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        await renderFlow();

        expect(strip().getAllByText("Could not be read")).toHaveLength(4);
        expect(strip().queryByText(/Not reported/)).toBeNull();
        expect(strip().queryByText(/No data for this window/)).toBeNull();
        expect(document.body.textContent).not.toContain("Service Unavailable");
    });

    it("empty answer: the tiles say 'Not reported' and never 'Could not be read'", async () => {
        getHome.mockResolvedValue(emptyHome);
        await renderFlow();

        expect(strip().getAllByText("Not reported")).toHaveLength(4);
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: a served value is drawn and nothing says 'Could not be read'", async () => {
        getHome.mockResolvedValue(servedHome);
        await renderFlow();

        expect(strip().getByText(/4\.2/)).toBeInTheDocument();
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
