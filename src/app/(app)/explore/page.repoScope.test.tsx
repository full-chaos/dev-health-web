/** CHAOS-9089: the Explore tile of an unscoped metric says so when a repository is selected. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen, within } from "@/test/utils";

import { encodeFilter } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";

vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "o1", name: "Full Chaos" } }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/api/home", () => ({
    getExplainOutcome: async (p: { metric: string }) => ({
        noView: false,
        data: {
            metric: p.metric,
            label: p.metric,
            unit: "days",
            value: 5,
            delta_pct: 10,
            drivers: [],
            contributors: [],
            drilldown_links: {},
        },
    }),
    getHomeData: async () => null,
}));
vi.mock("@/lib/api/investment", () => ({
    getDrilldown: async () => null,
    getBlockedWorkIssues: async () => ({ items: [], count: 0 }),
}));

import Explore from "./page";

afterEach(cleanup);

const draw = async (metric: string, repos: string[]) => {
    const f = encodeFilter({ ...defaultMetricFilter, what: repos.length ? { repos } : {} });
    render(await Explore({ searchParams: Promise.resolve({ metric, f }) }));
    return within(screen.getByTestId("explore-metric-tile"));
};

describe("Explore tile repository note", () => {
    it("notes an unscoped metric (explain view and blocked-work view)", async () => {
        for (const metric of ["cycle_time", "blocked_work"]) {
            const tile = await draw(metric, ["full-chaos/dev-health-web"]);
            expect(tile.getByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeTruthy();
            cleanup();
        }
    });
    it("does not note a repository-scoped metric, or any metric without a repository", async () => {
        const scoped = await draw("review_latency", ["full-chaos/dev-health-web"]);
        expect(scoped.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
        cleanup();
        const none = await draw("cycle_time", []);
        expect(none.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });
});
