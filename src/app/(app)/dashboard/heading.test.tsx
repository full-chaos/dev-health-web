import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { AppShell } from "@/components/shell/AppShell";
import { checkApiHealth } from "@/lib/api/system";
import { formatTimestamp } from "@/lib/formatters";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";

import Home from "./page";

// The Home's header is the shared PageHeader: one h1 for the page, the
// eyebrow from the navigation trail. The primary-signal hero is rendered for real
// here, because the block it replaced used to bring a second h1.

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));

vi.mock("@/components/home/HomeMonitoring", () => ({ HomeMonitoring: () => null }));
vi.mock("@/components/home/InvestigationThreads", () => ({ InvestigationThreads: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

async function renderCockpit() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <EvidenceDrawerProvider>
                <AppShell>{await Home({ searchParams: Promise.resolve({}) })}</AppShell>
            </EvidenceDrawerProvider>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

describe("Home page header", () => {
    it("has exactly one h1 on the page: the page title", async () => {
        await renderCockpit();

        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Home");
        expect(within(screen.getByTestId("page-header")).getByRole("heading", { level: 1 })).toBe(
            headings[0],
        );
    });

    it("has no health headline: the body shows only the approved blocks (CHAOS-8063)", async () => {
        await renderCockpit();

        expect(screen.queryByTestId("cockpit-headline")).toBeNull();
        expect(screen.queryByTestId("cockpit-health-status")).toBeNull();
        expect(screen.queryByText("Engineering health is steady this week")).toBeNull();
    });

    it("names the primary signal in a section heading (h2) right under the title", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue({
            freshness: { last_ingested_at: null, sources: {}, coverage: {} },
            deltas: [],
            summary: [],
            tiles: {},
            constraint: { title: "", claim: "", evidence: [], experiments: [] },
            events: [],
            signals: [
                {
                    id: "metric:review_latency",
                    title: "Review Latency appears up",
                    metric: "review_latency",
                    current_value: "0.9 hours",
                    prior_value: "0.1 hours",
                    delta: "+1,041%",
                    direction: "up",
                    severity: "critical",
                    confidence: "medium",
                    affected_scope: "org-wide",
                    evidence_count: 7,
                    why_it_matters: "w",
                    recommended_action: "a",
                    category: "delivery",
                },
            ],
        } as never);
        await renderCockpit();

        const levels = within(screen.getByRole("main"))
            .getAllByRole("heading")
            .map((heading) => `${heading.tagName}:${heading.textContent}`);
        expect(levels.slice(0, 3)).toEqual([
            "H1:Home",
            "H2:Review Latency appears up",
            "H2:Evidence & context",
        ]);
    });

    it("has no eyebrow: the h1 is the nav label, so the eyebrow would only repeat it (A8)", async () => {
        await renderCockpit();

        expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
        expect(screen.queryByText("Status")).toBeNull();
    });

    it("keeps the subtitle in the header, has no last-updated row there, and shows no BackLink", async () => {
        await renderCockpit();

        const header = screen.getByTestId("page-header");
        expect(
            within(header).getByText(/System patterns over the last \d+ days\./),
        ).toBeInTheDocument();
        // "Last sync" is a row of the "Evidence & context" card (CHAOS-8063).
        expect(within(header).queryByText(/Last updated:/)).toBeNull();
        expect(within(header).queryAllByRole("link")).toHaveLength(0);
    });

    it("opens the page evidence from the header: the Home payload for the page scope and window", async () => {
        await renderCockpit();

        const action = within(screen.getByTestId("page-header-actions")).getByRole("button", {
            name: "View evidence",
        });
        expect(screen.queryByRole("dialog")).toBeNull();
        await userEvent.click(action);

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("Home");
        const days = screen
            .getByTestId("page-header")
            .textContent?.match(/over the last (\d+) days/)?.[1];
        const call = vi
            .mocked(global.fetch)
            .mock.calls.map(([input]) => new URL(String(input), "http://local"))
            .find((url) => url.pathname === "/api/v1/home");
        expect(call).toBeDefined();
        // The page as a whole: no thread. Same window as the subtitle states.
        expect(call?.searchParams.has("thread")).toBe(false);
        expect(call?.searchParams.get("range_days")).toBe(days);
    });

    // The freshness facts come from the Home answer (`home.freshness`), which is read for the
    // signed-in organization. The public meta route serves no organization data and is not read.
    const homeWithFreshness = (freshness: unknown) =>
        ({
            freshness,
            deltas: [],
            summary: [],
            tiles: {},
            constraint: { title: "", claim: "", evidence: [], experiments: [] },
            events: [],
        }) as never;

    const drawerRows = () =>
        within(within(screen.getByRole("dialog")).getByTestId("home-evidence-coverage"))
            .queryAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);

    it("lists the served freshness facts in the page evidence drawer, not in the header: last ingest and the three coverage percents", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(
            homeWithFreshness({
                last_ingested_at: "2026-07-12T00:07:00Z",
                sources: {},
                coverage: {
                    repos_covered_pct: 100,
                    prs_linked_to_issues_pct: 0,
                    issues_with_cycle_states_pct: 41.6,
                },
            }),
        );
        await renderCockpit();

        // The old header strip ("Synced …", coverage counts) is not on the page.
        const header = screen.getByTestId("page-header");
        expect(header).not.toHaveTextContent("Synced");
        expect(header).not.toHaveTextContent("covered");

        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        // Every served number, zero included (zero is a served value, not a missing one).
        expect(drawerRows()).toEqual([
            ["Last ingested", formatTimestamp("2026-07-12T00:07:00Z")],
            ["Repositories covered", "100%"],
            ["PRs linked to issues", "0%"],
            ["Issues with cycle states", "42%"],
        ]);
    });

    it.each([
        [
            "the Home answer serves no coverage and no ingest time",
            { last_ingested_at: null, sources: {}, coverage: null },
        ],
        [
            "the coverage object has no number in it",
            { last_ingested_at: null, sources: {}, coverage: {} },
        ],
    ])(
        "draws no row for a freshness fact that is not served, never a zero, when %s",
        async (_name, freshness) => {
            vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(homeWithFreshness(freshness));
            await renderCockpit();
            await userEvent.click(screen.getByRole("button", { name: "View evidence" }));

            expect(drawerRows()).toEqual([]);
        },
    );

    it("reads 'Could not be read' on every row when the Home read failed: a failed read is not 'Not reported'", async () => {
        vi.mocked(getHomeDataViaGraphQL).mockRejectedValue(new Error("[GraphQL] boom"));
        await renderCockpit();
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));

        expect(drawerRows()).toEqual([
            ["Coverage", "Could not be read"],
            ["Last ingested", "Could not be read"],
            ["Repositories covered", "Could not be read"],
            ["PRs linked to issues", "Could not be read"],
            ["Issues with cycle states", "Could not be read"],
        ]);
        const intro = within(screen.getByRole("dialog")).getByTestId("home-evidence-coverage");
        expect(intro).not.toHaveTextContent("Not reported");
        expect(screen.getByRole("dialog")).not.toHaveTextContent("boom");
    });

    it("does not read the public meta route for the page", async () => {
        const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal("fetch", fetchSpy);
        await renderCockpit();

        const paths = fetchSpy.mock.calls.map(([input]) => String(input));
        expect(paths.filter((path) => path.includes("/api/v1/meta"))).toEqual([]);
        // The helper is gone from the system API module.
        expect(Object.keys(await vi.importActual("@/lib/api/system"))).not.toContain("getApiMeta");
    });

    it("shows the served source coverage in the page evidence drawer, or no row", async () => {
        const home = (coveragePct: number | null) =>
            ({
                freshness: { last_ingested_at: null, sources: {}, coverage: {} },
                deltas: [],
                summary: [],
                tiles: {},
                constraint: { title: "", claim: "", evidence: [], experiments: [] },
                events: [],
                data_confidence: {
                    level: "high",
                    coverage_pct: coveragePct,
                    connected_sources: [],
                    missing_sources: [],
                    caveats: [],
                },
            }) as never;

        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(home(91.6));
        const served = await renderCockpit();
        // The coverage is not a body element (the banner is mocked out; the card has no such row).
        expect(screen.queryByText("92%")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        const coverage = within(screen.getByRole("dialog")).getByTestId("home-evidence-coverage");
        expect(within(coverage).getByText("Coverage")).toBeInTheDocument();
        // The first row is the source coverage; the freshness facts follow it.
        expect(within(coverage).getAllByTestId("evidence-fact")[0]).toHaveTextContent(
            "Coverage92%",
        );
        served.unmount();

        vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(home(null));
        await renderCockpit();
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        expect(
            within(
                within(screen.getByRole("dialog")).getByTestId("home-evidence-coverage"),
            ).queryByText("Coverage"),
        ).toBeNull();
    });
});
