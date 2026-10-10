import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { checkApiHealth } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";

import Home from "./page";

// The Investigation threads block on the Home page (CHAOS-8064), and the blocks that left the
// page body with it: the Investment mix preview and the AI Workflow callout (pinned under
// CHAOS-7739). Each link they carried is still reachable; this file states where.

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { org_id: "org-1" } })) }));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const aiHome = (dominant: boolean) =>
    ({
        freshness: {
            latest_successful_sync_at: null,
            last_ingested_at: null,
            sources: {},
            coverage: {},
        },
        deltas: [
            {
                metric: "throughput",
                label: "Throughput",
                value: 10,
                unit: "items",
                delta_pct: 1,
                spark: [],
            },
        ],
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
        signals: dominant
            ? [1, 2, 3].map((n) => ({
                  id: `s${n}`,
                  title: `AI signal ${n}`,
                  category: "ai",
                  severity: "high",
                  confidence: "high",
                  metric: "ai_x",
                  current_value: "1",
                  direction: "up",
              }))
            : [],
    }) as never;

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed" });
    // An EMPTY answer. (`null` would be a FAILED read: the drawer then draws the failed-read state.)
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue({
        freshness: { last_ingested_at: null, sources: {}, coverage: null },
        deltas: [],
        summary: [],
        tiles: {},
        events: [],
    } as never);
});

describe("Investigation threads block on Home (CHAOS-8064)", () => {
    it("is the last block of the body, with the four rows", async () => {
        render(await Home({ searchParams: Promise.resolve({}) }));
        const body = screen.getByTestId("home-primary");
        expect(body.lastElementChild).toBe(screen.getByTestId("investigation-threads"));
        expect(
            [...body.querySelectorAll("[data-testid^='thread-row-']")].map((row) =>
                row.getAttribute("data-testid"),
            ),
        ).toEqual([
            "thread-row-key-shifts",
            "thread-row-investment-mix",
            "thread-row-compounding-risk",
            "thread-row-recent-events",
        ]);
    });

    it("the body holds only the approved blocks, in the approved order", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(aiHome(false));
        render(await Home({ searchParams: Promise.resolve({}) }));
        const headings = within(screen.getByTestId("home-primary"))
            .getAllByRole("heading", { level: 2 })
            .map((heading) => heading.textContent);
        // The banner, the hero and the table are mocked out in this file.
        expect(headings).toEqual(["Evidence & context", "Monitoring", "Investigation threads"]);
    });

    it("Investment mix: the row links to the Investment view with the filter and the role", async () => {
        render(await Home({ searchParams: Promise.resolve({ lens: "em" }) }));
        expect(screen.getByRole("heading", { name: "Investment mix" })).toBeInTheDocument();
        const inspect = screen.getByRole("link", { name: "Inspect: Investment mix" });
        expect(inspect.getAttribute("href")).toMatch(/^\/investment\?f=.+&role=em$/);
    });

    it("Investment mix: no allocation preview and no 'Open Work view' link in the body", async () => {
        render(await Home({ searchParams: Promise.resolve({ lens: "em" }) }));
        expect(screen.queryByText("Work allocation snapshot for the selected window.")).toBeNull();
        expect(screen.queryByRole("link", { name: "Open Work view" })).toBeNull();
        expect(screen.getByTestId("investigation-threads").querySelector("details")).toBeNull();
    });

    it("Investment mix: its old throughput evidence link is the Throughput tile of Monitoring (Throughput group)", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(aiHome(false));
        render(
            await Home({ searchParams: Promise.resolve({ lens: "em", monitoring: "throughput" }) }),
        );
        const href =
            within(screen.getByTestId("monitoring-tile-throughput"))
                .getByRole("link")
                .getAttribute("href") ?? "";
        expect(href).toContain("/explore?metric=throughput");
        expect(href).toContain("role=em");
    });

    it("Key shifts and Compounding risk: Inspect keeps the role and the filter", async () => {
        render(await Home({ searchParams: Promise.resolve({ lens: "em" }) }));
        expect(
            screen.getByRole("link", { name: "Inspect: Key shifts" }).getAttribute("href"),
        ).toMatch(/^\/explore\?role=em&f=.+$/);
        expect(
            screen.getByRole("link", { name: "Inspect: Compounding risk" }).getAttribute("href"),
        ).toMatch(/^\/risk\/compounding\?f=.+&role=em$/);
    });

    it("Recent events & limiting factors: Inspect opens the shared drawer with the long-form sections and their links", async () => {
        render(await Home({ searchParams: Promise.resolve({ lens: "em" }) }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await userEvent.click(
            screen.getByRole("button", { name: "Inspect: Recent events & limiting factors" }),
        );
        const drawer = within(screen.getByRole("dialog", { name: "Evidence & Context" }));
        for (const heading of [
            "Notable shifts",
            "Investigation threads",
            "Limiting factor",
            "Recent events",
        ]) {
            expect(drawer.getByRole("heading", { name: heading })).toBeInTheDocument();
        }
        expect(drawer.getByRole("link", { name: "View all" }).getAttribute("href")).toMatch(
            /^\/opportunities\?f=.+&role=em$/,
        );
        expect(drawer.getByRole("link", { name: "Open evidence" }).getAttribute("href")).toMatch(
            /^\/explore\?role=em&f=.+$/,
        );
    });

    it.each([
        ["does not dominate", false],
        ["dominates", true],
    ])(
        "AI Workflow: no callout and no quiet link in the body when AI %s",
        async (_name, dominant) => {
            vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(aiHome(dominant));
            render(await Home({ searchParams: Promise.resolve({}) }));
            expect(screen.queryByTestId("ai-workflow-callout")).toBeNull();
            expect(screen.queryByTestId("ai-workflow-secondary-link")).toBeNull();
            expect(screen.queryByRole("link", { name: "Open AI Workflows" })).toBeNull();
        },
    );
});
