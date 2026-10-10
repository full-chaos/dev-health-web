/**
 * CHAOS-9077: the Explore tiles pass the catalog polarity of the metric; the change tone must not move.
 * Covers both tile sites: the explain view and the blocked-work view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen, within } from "@/test/utils";

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

const explain = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/api/home", () => ({
    getExplainData: async () => explain.value,
    getHomeData: async () => null,
}));
vi.mock("@/lib/api/investment", () => ({
    getDrilldown: async () => null,
    getBlockedWorkIssues: async () => ({ items: [], count: 0 }),
}));

import Explore from "./page";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

beforeEach(() => {
    explain.value = null;
});
afterEach(cleanup);

async function deltaClass(metric: string, delta_pct: number) {
    explain.value = {
        metric,
        label: metric,
        unit: "%",
        value: 5,
        delta_pct,
        drivers: [],
        contributors: [],
        drilldown_links: {},
    };
    render(await Explore({ searchParams: Promise.resolve({ metric }) }));
    const cls = within(screen.getByTestId("explore-metric-tile")).getByTestId(
        "metric-delta",
    ).className;
    cleanup();
    return cls;
}

describe("Explore tile change tone", () => {
    it("lower is better (cycle_time): falling good, rising bad", async () => {
        expect(await deltaClass("cycle_time", -10)).toContain(GOOD);
        const rising = await deltaClass("cycle_time", 10);
        expect(rising).toContain(BAD);
        expect(rising).not.toContain(GOOD);
    });
    it("higher is better (throughput): rising good, falling bad", async () => {
        expect(await deltaClass("throughput", 10)).toContain(GOOD);
        const falling = await deltaClass("throughput", -10);
        expect(falling).toContain(BAD);
        expect(falling).not.toContain(GOOD);
    });
    it("blocked-work tile (lower is better): falling good, rising bad", async () => {
        expect(await deltaClass("blocked_work", -10)).toContain(GOOD);
        const rising = await deltaClass("blocked_work", 10);
        expect(rising).toContain(BAD);
        expect(rising).not.toContain(GOOD);
    });
});
