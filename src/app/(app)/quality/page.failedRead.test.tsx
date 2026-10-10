/**
 * /quality, a FAILED Home read against an EMPTY Home answer (CHAOS-9189 in the describe name).
 * The real fetchOrNull and the real tiles (QualityEvidenceTiles, MetricCard) are used: the test
 * reads the drawn text. Only the Home fetcher and the unrelated page parts are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

const { getHome } = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/quality",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: getHome }));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/quality/ReworkThemeBars", () => ({
    ReworkThemeBars: () => <div data-testid="rework-theme-bars" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: () => <div data-testid="evidence-panel" />,
}));

import QualityPage from "./page";

const emptyHome = {
    freshness: {},
    deltas: [],
    summary: [],
    tiles: {},
    constraint: null,
    events: [],
    rework_theme_allocation: [],
};

const delta = (metric: string, label: string, value: number) => ({
    metric,
    label,
    value,
    unit: "%",
    delta_pct: 4,
    spark: [],
});

const servedHome = {
    ...emptyHome,
    deltas: [
        delta("change_failure_rate", "Change Failure Rate", 3),
        delta("ci_success", "CI Success Rate", 91),
        delta("pr_rework_ratio", "PR Rework Ratio", 12),
    ],
};

const draw = async () => render(await QualityPage({ searchParams: Promise.resolve({}) }));
const tiles = () => within(screen.getByTestId("quality-tiles"));

describe("/quality when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        getHome.mockReset();
    });

    it("failed read: the three tiles say 'Could not be read', not 'Not reported', and no backend text", async () => {
        getHome.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        await draw();

        expect(tiles().getAllByText("Could not be read")).toHaveLength(3);
        expect(tiles().queryByText(/Not reported/)).toBeNull();
        expect(tiles().queryByText(/No data for this window/)).toBeNull();
        expect(document.body.textContent).not.toContain("Service Unavailable");
    });

    it("empty answer: the tiles say 'Not reported' and never 'Could not be read'", async () => {
        getHome.mockResolvedValue(emptyHome);
        await draw();

        expect(tiles().getAllByText("Not reported")).toHaveLength(3);
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: served values are drawn and nothing says 'Could not be read'", async () => {
        getHome.mockResolvedValue(servedHome);
        await draw();

        const tile = screen.getByTestId("quality-tile-ci_success");
        expect(within(tile).getByTestId("metric-value")).toHaveTextContent("91 %");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
