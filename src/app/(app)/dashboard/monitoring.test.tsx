import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { DEFAULT_ROLE } from "@/lib/lensContext";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";

import Home from "./page";

// The Monitoring block on the Home page (CHAOS-8064). It replaced the "Monitoring views" card of
// three link cards (CHAOS-7738) and the Key Shifts tile grid: the three view links and the lens
// order stay; the cards' description texts and the "Open metrics" link are gone.

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { org_id: "org-1" } })) }));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestigationThreads", () => ({ InvestigationThreads: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const delta = (metric: string, label: string, value: number, unit: string, delta_pct: number) => ({
    metric,
    label,
    value,
    unit,
    delta_pct,
    spark: [],
});

const HOME = {
    freshness: { last_ingested_at: null, sources: { github: "ok" }, coverage: {} },
    deltas: [
        delta("cycle_time", "Cycle Time", 1.5, "days", 655),
        delta("review_latency", "Review Latency", 0.3, "hours", 258),
        delta("throughput", "Throughput", 1006, "items", -30),
        delta("wip_saturation", "WIP Saturation", 301, "%", -29),
        delta("deploy_freq", "Deploy Frequency", 148, "deploys", -45),
        delta("blocked_work", "Blocked Work", 7, "hours", -20),
    ],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
} as never;

beforeEach(() => {
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(HOME);
});

async function renderHome(params: Record<string, string> = {}) {
    render(await Home({ searchParams: Promise.resolve(params) }));
    const block = screen.getByTestId("home-monitoring");
    const links = within(screen.getByTestId("monitoring-segments")).getAllByRole(
        "button",
    ) as HTMLButtonElement[];
    return { block, links };
}

const segmentIds = (links: HTMLButtonElement[]) => links.map((b) => b.textContent?.toLowerCase());

describe("Monitoring block on Home (CHAOS-8064)", () => {
    it.each([
        ["neutral", {}, ["flow", "throughput", "dora"]],
        ["ic", { lens: "ic" }, ["flow", "throughput", "dora"]],
        ["em", { lens: "em" }, ["flow", "throughput", "dora"]],
        ["pm", { lens: "pm" }, ["flow", "throughput", "dora"]],
        ["leadership", { lens: "leadership" }, ["throughput", "dora", "flow"]],
    ] as const)("%s lens orders the three views %j", async (_name, params, expected) => {
        const { links } = await renderHome({ ...params });
        expect(segmentIds(links)).toEqual([...expected]);
    });

    it("has the heading 'Monitoring' and the jump text; the old card texts and 'Open metrics' are gone", async () => {
        const { block } = await renderHome();
        expect(within(block).getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();
        expect(block).toHaveTextContent("Jump to full diagnostic views");
        expect(screen.queryByText("Monitoring views")).toBeNull();
        expect(screen.queryByText("Tabs for steady trend monitoring.")).toBeNull();
        expect(screen.queryByRole("link", { name: "Open metrics" })).toBeNull();
        expect(screen.queryByText("Release speed and stability.")).toBeNull();
    });

    it("each view is a toggle button, and the jump link goes to the chosen tab with the filter and the role", async () => {
        const { links } = await renderHome({ lens: "em" });
        expect(links.map((a) => a.textContent)).toEqual(["Flow", "Throughput", "DORA"]);
        const href = screen.getByTestId("monitoring-jump").getAttribute("href") ?? "";
        expect(href.startsWith("/metrics?tab=flow")).toBe(true);
        expect(href).toContain("role=em");
        expect(href).toContain("f=");
    });

    it("keeps the default role on the jump link when no lens is set", async () => {
        await renderHome();
        expect(screen.getByTestId("monitoring-jump").getAttribute("href")).toContain(
            `role=${DEFAULT_ROLE}`,
        );
    });

    it("the monitoring search parameter picks the group shown on load", async () => {
        const { block } = await renderHome({ monitoring: "dora" });
        expect(within(block).getByTestId("monitoring-tile-deploy_freq")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "DORA" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("shows the four Flow tiles from the served deltas, each a link to its metric evidence with the page role", async () => {
        const { block } = await renderHome({ lens: "pm" });
        const tiles = within(block).getByTestId("monitoring-tiles");
        expect(tiles).toHaveAttribute("data-columns", "4");
        for (const [metric, label] of [
            ["cycle_time", "Cycle Time"],
            ["review_latency", "Review Latency"],
            ["wip_saturation", "WIP Saturation"],
            ["blocked_work", "Blocked Work"],
        ]) {
            const tile = within(tiles).getByTestId(`monitoring-tile-${metric}`);
            expect(tile).toHaveTextContent(label);
            const href = within(tile).getByRole("link").getAttribute("href") ?? "";
            expect(href).toContain(`/explore?metric=${metric}`);
            expect(href).toContain("role=pm");
            expect(href).toContain("f=");
        }
        // The Key Shifts grid of up to eight tiles is not on the page.
        expect(screen.queryByTestId("key-shifts-row")).toBeNull();
        expect(tiles).not.toHaveTextContent("Deploy Frequency");
    });
});
