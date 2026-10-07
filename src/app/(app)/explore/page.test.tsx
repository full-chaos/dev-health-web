/**
 * Pins /explore (metric evidence) in the approved prototype layout (`metricEvidence()`): header
 * with "View evidence", the notice, one tile, "Read the signal" beside "Context" (fact rows and
 * "Return to investigation"), the two association cards and the evidence shortcuts.
 * Server component: called as a function, element tree rendered, data and shell parts mocked.
 * The evidence drawer is the real shared provider; its request panel is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";
import { CTA_LABELS } from "@/lib/design/cta";

const { panelSpy, orgName } = vi.hoisted(() => ({
    panelSpy: vi.fn(),
    orgName: { value: "Full Chaos" as string | undefined },
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelSpy(props);
        return <div data-testid="evidence-panel" />;
    },
}));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({
        data: orgName.value ? { id: "o1", name: orgName.value } : undefined,
    }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
const barSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: (props: Record<string, unknown>) => {
        barSpy(props);
        return <div data-testid="bar-chart" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

const explain = vi.hoisted(() => ({
    value: {
        metric: "cycle_time",
        label: "Cycle Time",
        unit: "days",
        value: 4.2,
        delta_pct: -12,
        drivers: [
            {
                id: "d1",
                label: "repo-alpha",
                value: 3,
                delta_pct: -20,
                evidence_link: "/api/v1/drilldown/prs?x=1",
            },
        ],
        contributors: [
            {
                id: "c1",
                label: "repo-gamma",
                value: 7,
                delta_pct: 1,
                evidence_link: "/api/v1/drilldown/prs?x=3",
            },
        ],
        drilldown_links: { "Pull requests": "/api/v1/drilldown/prs?metric=cycle_time" },
    } as Record<string, unknown> | null,
}));
const blockedIssues = vi.hoisted(() => ({
    value: {
        items: [
            {
                work_item_id: "linear:CHAOS-8106",
                provider: "linear",
                status: "blocked" as const,
                team_id: "team-ops",
                cycle_time_hours: null,
                lead_time_hours: null,
                started_at: null,
                completed_at: null,
            },
            {
                work_item_id: "github:full-chaos/dev-health#8106",
                provider: "github",
                status: "blocked" as const,
                team_id: null,
                cycle_time_hours: null,
                lead_time_hours: null,
                started_at: null,
                completed_at: null,
            },
        ],
        count: 2,
    } as Record<string, unknown> | null,
    request: vi.fn(),
}));
const genericDrilldownRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/home", () => ({
    getExplainData: async () => explain.value,
    getHomeData: async () => null,
}));
vi.mock("@/lib/api/investment", () => ({
    getDrilldown: async (...args: unknown[]) => {
        genericDrilldownRequest(...args);
        return null;
    },
    getBlockedWorkIssues: async (...args: unknown[]) => {
        blockedIssues.request(...args);
        return blockedIssues.value;
    },
}));

import Explore from "./page";

const renderExplore = async (params: Record<string, string> = {}) =>
    render(await Explore({ searchParams: Promise.resolve(params) }));

const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const FULL = {
    metric: "cycle_time",
    label: "Cycle Time",
    unit: "days",
    value: 4.2,
    delta_pct: -12,
    drivers: [
        {
            id: "d1",
            label: "repo-alpha",
            value: 3,
            delta_pct: -20,
            evidence_link: "/api/v1/drilldown/prs?x=1",
        },
    ],
    contributors: [
        {
            id: "c1",
            label: "repo-gamma",
            value: 7,
            delta_pct: 1,
            evidence_link: "/api/v1/drilldown/prs?x=3",
        },
    ],
    drilldown_links: { "Pull requests": "/api/v1/drilldown/prs?metric=cycle_time" },
};

beforeEach(() => {
    explain.value = { ...FULL };
    orgName.value = "Full Chaos";
    panelSpy.mockClear();
    barSpy.mockClear();
});

describe("/explore in the approved prototype layout (CHAOS-8068)", () => {
    it("header: metric label as title, the subtitle, one action 'View evidence'; the legacy line and buttons are gone", async () => {
        await renderExplore();
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Cycle Time");
        expect(header.getByText("Evidence detail for the selected metric.")).toBeInTheDocument();
        expect(screen.queryByText("Select evidence to investigate.")).toBeNull();
        const actions = within(screen.getByTestId("page-header-actions"));
        expect(actions.getAllByRole("button")).toHaveLength(1);
        expect(actions.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
        expect(actions.queryAllByRole("link")).toHaveLength(0);
    });

    it("a served label that differs from the catalog label shows in the title AND the eyebrow (CHAOS-8570)", async () => {
        explain.value = { ...FULL, label: "Lead Time To Merge" };
        await renderExplore();
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Lead Time To Merge");
        expect(header.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Diagnose / Lead Time To Merge evidence",
        );
    });

    it("on the drilldown view the eyebrow keeps the area only", async () => {
        await renderExplore({ api: "/api/v1/drilldown/prs" });
        expect(
            within(screen.getByTestId("page-header")).getByTestId("page-header-eyebrow"),
        ).toHaveTextContent(/^Diagnose$/);
    });

    it("View evidence opens the shared drawer for the page metric, with the role", async () => {
        await renderExplore({ role: "manager" });
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        expect(screen.getByTestId("evidence-panel")).toBeInTheDocument();
        expect(panelSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            title: "Cycle Time",
            metric: "cycle_time",
            role: "manager",
        });
    });

    it("on the drilldown view, View evidence explains that drilldown (the served api), not the metric", async () => {
        await renderExplore({ api: "/api/v1/drilldown/prs" });
        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        expect(panelSpy.mock.calls.at(-1)?.[0]).toMatchObject({ apiUrl: "/api/v1/drilldown/prs" });
    });

    it("the notice states the page's purpose, as drawn, without a live region", async () => {
        await renderExplore();
        const notice = screen.getByTestId("explore-notice");
        expect(notice).toHaveTextContent(
            "Metric evidence is a full destination as well as a contextual drawer. Keep the metric, scope, and source together.",
        );
        expect(notice).not.toHaveAttribute("role");
    });

    it("one tile with the served value and change: it replaces the Snapshot card", async () => {
        await renderExplore();
        const strip = screen.getByTestId("explore-metric-tile");
        expect(strip).toHaveAttribute("data-columns", "1");
        expect(strip).toHaveTextContent("Cycle Time");
        // The shared tile: the number and the served unit apart.
        expect(within(strip).getByTestId("metric-value")).toHaveTextContent(/^4\.2 days$/);
        expect(strip).toHaveTextContent("12%");
        expect(strip).toHaveTextContent("vs previous window");
        expect(screen.queryByText("Snapshot")).toBeNull();
    });

    it("with no data: the tile shows 'Not reported' and no change, the cards say data will appear", async () => {
        explain.value = null;
        await renderExplore();
        const strip = screen.getByTestId("explore-metric-tile");
        expect(within(strip).getByTestId("metric-value")).toHaveTextContent(/^Not reported$/);
        expect(strip).toHaveTextContent("No prior period");
        expect(
            screen.getByText("Association detail will appear once data is ingested."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Contributor detail will appear once data is ingested."),
        ).toBeInTheDocument();
    });

    it("'Read the signal' and 'Context' share one row, signal first", async () => {
        await renderExplore();
        const row = screen.getByTestId("explore-signal-row");
        const signal = within(row).getByTestId("read-the-signal");
        const context = within(row).getByTestId("explore-context");
        expect(follows(signal, context)).toBe(true);
        expect(row.className).toContain("lg:grid-cols-[minmax(0,1fr)_22rem]");
        expect(signal).toHaveTextContent("Cycle Time appears down");
        expect(signal).toHaveTextContent("shows 4.2d and a -12% change over the selected window");
        expect(
            within(signal).getByRole("heading", { level: 2, name: "Read the signal" }),
        ).toBeInTheDocument();
    });

    it("Context: fact rows for the metric, the organization, the window, the scope and the source", async () => {
        await renderExplore();
        const context = screen.getByTestId("explore-context");
        expect(
            within(context).getByText(
                /This view explains Cycle Time for all orgs over the last \d+ days\./,
            ),
        ).toBeInTheDocument();
        const rows = within(context)
            .getAllByTestId("evidence-fact")
            .map((row) => row.textContent);
        expect(rows[0]).toBe("MetricCycle Time");
        expect(rows[1]).toBe("OrganizationFull Chaos");
        expect(rows).toContain("Scopeorg");
        expect(rows.some((row) => /^Window\d+ days$/.test(row ?? ""))).toBe(true);
        expect(rows.some((row) => /^Compared withthe previous \d+ days$/.test(row ?? ""))).toBe(
            true,
        );
        expect(rows.at(-1)).toBe("SourceMetric explanation");
        // The internal view tag and the chip block are gone.
        expect(screen.queryByText("EXPLAIN")).toBeNull();
        expect(screen.queryByText("Active filters")).toBeNull();
    });

    it("Context: an organization name that is not served draws no row", async () => {
        orgName.value = undefined;
        await renderExplore();
        const rows = within(screen.getByTestId("explore-context"))
            .getAllByTestId("evidence-fact")
            .map((row) => row.textContent);
        expect(rows.some((text) => text?.startsWith("Organization"))).toBe(false);
    });

    it("an old URL that carries the removed filters shows rows only for the filters a query reads (CHAOS-7799)", async () => {
        const f = Buffer.from(
            JSON.stringify({
                time: { range_days: 30, compare_days: 30 },
                scope: { level: "team", ids: ["alpha"] },
                who: { developers: ["ana@example.com"], roles: ["reviewer"] },
                what: { repos: ["org/api"], artifacts: ["pr"] },
                why: { work_category: ["feature"], issue_type: ["bug"] },
                how: { flow_stage: ["review"], blocked: true },
            }),
            "utf-8",
        ).toString("base64url");
        await renderExplore({ f });

        const rows = within(screen.getByTestId("explore-context"))
            .getAllByTestId("evidence-fact")
            .map((row) => row.textContent);
        for (const row of [
            "Scopeteam: alpha",
            "Developersana@example.com",
            "Repositoriesorg/api",
            "Work typefeature",
            "Window30 days",
            "Compared withthe previous 30 days",
        ]) {
            expect(rows, row).toContain(row);
        }
        for (const gone of [/Roles/, /Artifacts/, /Issue type/, /Flow/, /Blocked/]) {
            expect(
                rows.some((row) => gone.test(row ?? "")),
                String(gone),
            ).toBe(false);
        }
    });

    it("Context actions: 'Return to investigation' to the metric's Flow tab, then Flame diagram and Landscape", async () => {
        await renderExplore({ role: "manager" });
        const context = within(screen.getByTestId("explore-context"));
        const links = context.getAllByRole("link");
        expect(links.map((l) => l.textContent)).toEqual([
            "Return to investigation",
            "Flame Diagram",
            "Landscape",
        ]);
        const back = new URL(links[0].getAttribute("href") ?? "", "https://app.example");
        expect(back.pathname).toBe("/metrics");
        expect(back.searchParams.get("tab")).toBe("flow");
        expect(back.searchParams.get("role")).toBe("manager");
        expect(links[0].className).toContain("bg-(--action)");
        expect(links[1].getAttribute("href")).toContain("/work?tab=flame&mode=cycle_breakdown");
        expect(links[2].getAttribute("href")).toContain("/landscape");
        // The header has no back link of its own: this button is the return path.
        expect(
            within(screen.getByTestId("page-header")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
    });

    it("'Return to investigation' goes to the served origin when the URL carries an internal one", async () => {
        const origin = "/investment?tab=allocation&role=manager";
        await renderExplore({ origin, role: "em" });
        const back = within(screen.getByTestId("explore-context")).getByRole("link", {
            name: "Return to investigation",
        });
        expect(back).toHaveAttribute("href", origin);
    });

    it("'Return to investigation' rejects an origin that is not an internal path: the Flow tab instead", async () => {
        for (const origin of [
            "https://evil.example/x",
            "//evil.example/x",
            "/\\evil.example/x",
            "javascript:alert(1)",
            "metrics?tab=flow",
            "/metrics\nSet-Cookie: x",
            "",
        ]) {
            const { unmount } = await renderExplore({ origin, role: "manager" });
            const back = within(screen.getByTestId("explore-context")).getByRole("link", {
                name: "Return to investigation",
            });
            const href = back.getAttribute("href") ?? "";
            expect(href, origin).not.toContain("evil");
            expect(href, origin).not.toMatch(/^javascript:/u);
            const url = new URL(href, "https://app.example");
            expect(url.origin, origin).toBe("https://app.example");
            expect(url.pathname, origin).toBe("/metrics");
            expect(url.searchParams.get("tab"), origin).toBe("flow");
            expect(url.searchParams.get("role"), origin).toBe("manager");
            unmount();
        }
    });

    it("'Return to investigation' picks the tab that shows the metric when it is no tab's headline", async () => {
        // WIP Saturation is no tab's headline; the first tab that shows it is Flow.
        await renderExplore({ metric: "wip_saturation" });
        const back = within(screen.getByTestId("explore-context")).getByRole("link", {
            name: "Return to investigation",
        });
        expect(
            new URL(back.getAttribute("href") ?? "", "https://app.example").searchParams.get("tab"),
        ).toBe("flow");
    });

    it("'Likely associations' and 'Primary contributors': two section cards, meter rows only, an Evidence button each", async () => {
        await renderExplore({ role: "manager" });
        const cards = screen.getByTestId("association-cards");
        const sections = Array.from(cards.querySelectorAll(":scope > section")) as HTMLElement[];
        expect(
            sections.map((s) => within(s).getByRole("heading", { level: 2 }).textContent),
        ).toEqual(["Likely associations", "Primary contributors"]);
        expect(screen.queryByText("Top Associations")).toBeNull();
        expect(screen.queryByText("Contributors")).toBeNull();
        // Meter rows only (prototype bars()): no axis chart; the link rows went to the drawer
        // (it lists the same items with links).
        expect(within(cards).queryAllByRole("link")).toHaveLength(0);
        expect(barSpy).not.toHaveBeenCalled();
        const associationRows = within(
            within(sections[0]).getByRole("list", { name: "Likely associations" }),
        ).getAllByTestId("meter-row");
        expect(associationRows.map((row) => row.textContent)).toEqual(["repo-alpha-20%"]);
        // Signed (K-5): a decrease fills LEFT of the zero line, to half the track at most.
        const fill = within(associationRows[0]).getByTestId("meter-fill");
        expect(fill.style.width).toBe("50%");
        expect(fill).toHaveAttribute("data-direction", "left");
        const contributorRows = within(
            within(sections[1]).getByRole("list", { name: "Primary contributors" }),
        ).getAllByTestId("meter-row");
        // The value carries the served unit, so the unit note under the card is gone.
        expect(contributorRows.map((row) => row.textContent)).toEqual(["repo-gamma7d"]);
        expect(within(sections[0]).getByTestId("data-note")).toHaveTextContent(
            "no causal conclusion is added.",
        );
        expect(within(sections[1]).queryByTestId("data-note")).toBeNull();

        await userEvent.click(
            screen.getByRole("button", { name: "Evidence: Primary contributors" }),
        );
        expect(panelSpy.mock.calls.at(-1)?.[0]).toMatchObject({
            metric: "cycle_time",
            role: "manager",
        });
    });

    it("evidence shortcuts (not in the prototype) stay, last, as a section with the served links", async () => {
        await renderExplore({ role: "manager" });
        const shortcuts = screen.getByTestId("evidence-shortcuts");
        expect(
            within(shortcuts).getByRole("heading", { level: 2, name: "Evidence shortcuts" }),
        ).toBeInTheDocument();
        expect(shortcuts).toHaveTextContent("Evidence links stay in this scope.");
        const link = within(shortcuts).getByRole("link", { name: "Pull requests" });
        expect(link.getAttribute("href")).toContain("/explore?api=");
        expect(follows(screen.getByTestId("association-cards"), shortcuts)).toBe(true);
    });

    it("order: notice, tile, the signal row, the association cards", async () => {
        await renderExplore();
        const order = [
            screen.getByTestId("explore-notice"),
            screen.getByTestId("explore-metric-tile"),
            screen.getByTestId("explore-signal-row"),
            screen.getByTestId("association-cards"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(follows(order[i], order[i + 1]), `block ${i}`).toBe(true);
        }
    });

    it("the Debug filters block is gone", async () => {
        const { container } = await renderExplore();
        expect(screen.queryByText("Debug filters")).toBeNull();
        expect(container.querySelector("details")).toBeNull();
        expect(container.querySelector("pre")).toBeNull();
    });

    it("no Read the signal card, no notice and no tile on the drilldown view; the Context card stays", async () => {
        await renderExplore({ api: "/api/v1/drilldown/prs" });
        expect(screen.queryByTestId("read-the-signal")).toBeNull();
        expect(screen.queryByTestId("explore-notice")).toBeNull();
        expect(screen.queryByTestId("explore-metric-tile")).toBeNull();
        expect(screen.getByTestId("explore-context")).toBeInTheDocument();
        expect(
            within(screen.getByTestId("explore-context")).getAllByTestId("evidence-fact").at(-1),
        ).toHaveTextContent("SourceEvidence drilldown");
    });
});

describe("/explore?metric=blocked_work: the Blocked Work evidence page (prototype blockedEvidence(), CHAOS-8069)", () => {
    const BLOCKED = {
        metric: "blocked_work",
        label: "Blocked Work",
        unit: "hours",
        value: 0,
        delta_pct: 0,
        drivers: [],
        contributors: [],
        drilldown_links: {
            prs: "/api/v1/drilldown/prs?metric=blocked_work",
            issues: "/api/v1/drilldown/issues?metric=blocked_work",
        },
    };
    beforeEach(() => {
        explain.value = { ...BLOCKED };
        blockedIssues.value = {
            items: [
                {
                    work_item_id: "linear:CHAOS-8106",
                    provider: "linear",
                    status: "blocked",
                    team_id: "team-ops",
                    cycle_time_hours: null,
                    lead_time_hours: null,
                    started_at: null,
                    completed_at: null,
                },
                {
                    work_item_id: "github:full-chaos/dev-health#8106",
                    provider: "github",
                    status: "blocked",
                    team_id: null,
                    cycle_time_hours: null,
                    lead_time_hours: null,
                    started_at: null,
                    completed_at: null,
                },
            ],
            count: 2,
        };
        blockedIssues.request.mockClear();
        genericDrilldownRequest.mockClear();
    });

    it("header: the metric label and the prototype subtitle; View evidence stays", async () => {
        await renderExplore({ metric: "blocked_work" });
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Blocked Work");
        expect(header.getByText("Evidence table for the selected metric.")).toBeInTheDocument();
        expect(header.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
    });

    it("body: one tile with the served value, then the evidence section; no legacy blocks", async () => {
        await renderExplore({ metric: "blocked_work" });
        const strip = screen.getByTestId("explore-metric-tile");
        expect(strip).toHaveAttribute("data-columns", "1");
        expect(within(strip).getByTestId("metric-value")).toHaveTextContent(/^0 hours$/);
        const section = screen.getByTestId("blocked-work-evidence");
        expect(follows(strip, section)).toBe(true);
        expect(
            within(section).getByRole("heading", { level: 2, name: "Blocked Work evidence" }),
        ).toBeInTheDocument();
        for (const gone of [
            "explore-notice",
            "read-the-signal",
            "explore-context",
            "association-cards",
            "explore-signal-row",
        ]) {
            expect(screen.queryByTestId(gone), gone).toBeNull();
        }
    });

    it("renders the served count and item identity, without per-item duration or titles", async () => {
        await renderExplore({ metric: "blocked_work" });
        expect(screen.getByTestId("blocked-work-count")).toHaveTextContent(
            "Captured work items: 2 items",
        );
        const items = screen.getAllByTestId("blocked-work-item");
        expect(items.map((item) => item.textContent)).toEqual([
            "linear:CHAOS-8106linearblockedteam-ops",
            "github:full-chaos/dev-health#8106githubblockedNot reported",
        ]);
        expect(screen.queryByText(/cycle time/i)).toBeNull();
        expect(screen.queryByText(/duration/i)).toBeNull();
    });

    it("uses the count measured before the endpoint limit and does not call the result complete", async () => {
        blockedIssues.value = {
            items: Array.from({ length: 50 }, (_, index) => ({
                work_item_id: `linear:CHAOS-${8100 + index}`,
                provider: "linear",
                status: "blocked",
                team_id: "team-ops",
                cycle_time_hours: null,
                lead_time_hours: null,
                started_at: null,
                completed_at: null,
            })),
            count: 51,
        };
        await renderExplore({ metric: "blocked_work" });
        expect(screen.getByTestId("blocked-work-count")).toHaveTextContent(
            "Captured work items: 51 items",
        );
        expect(
            screen.getByText(
                "The service returned the first 50 items of 51 items. It does not serve another page.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("blocked-work-complete-table")).toBeNull();
    });

    it("shows a measured zero and a missing result as different states", async () => {
        blockedIssues.value = { items: [], count: 0 };
        const { unmount } = await renderExplore({ metric: "blocked_work" });
        expect(screen.getByTestId("blocked-work-count")).toHaveTextContent(
            "Captured work items: 0 items",
        );
        expect(screen.getByTestId("blocked-work-items-empty")).toHaveTextContent(
            "No blocked work items were served for this window.",
        );
        unmount();

        blockedIssues.value = null;
        await renderExplore({ metric: "blocked_work" });
        expect(screen.getByTestId("blocked-work-count")).toHaveTextContent(
            "Captured work items: Not reported",
        );
        expect(screen.getByTestId("blocked-work-items-unavailable")).toHaveTextContent(
            "Blocked work items were not reported for this window.",
        );
    });

    it("marks the bounded complete-table link and reuses the endpoint-specific client", async () => {
        const { unmount: unmountSummary } = await renderExplore({
            metric: "blocked_work",
            role: "manager",
        });
        const completeTable = screen.getByTestId("blocked-work-complete-table");
        expect(completeTable).toHaveTextContent(CTA_LABELS.openCompleteTable);
        const href = completeTable.getAttribute("href") ?? "";
        const url = new URL(href, "https://app.example");
        expect(url.searchParams.get("api")).toBe("/api/v1/drilldown/issues");
        expect(url.searchParams.get("blocked")).toBe("true");
        expect(url.searchParams.get("metric")).toBe("blocked_work");
        expect(blockedIssues.request).toHaveBeenCalledTimes(1);
        unmountSummary();

        const { unmount } = await renderExplore({
            api: "/api/v1/drilldown/issues",
            metric: "blocked_work",
            blocked: "true",
        });
        expect(screen.getByTestId("blocked-work-complete-table-view")).toBeInTheDocument();
        expect(screen.getByTestId("blocked-work-complete-table")).toHaveTextContent(
            "linear:CHAOS-8106",
        );
        expect(blockedIssues.request).toHaveBeenCalledTimes(2);
        expect(genericDrilldownRequest).not.toHaveBeenCalled();
        unmount();
    });

    it("the inset says that zero is not evidence of no blocked work", async () => {
        await renderExplore({ metric: "blocked_work" });
        const inset = screen.getByTestId("blocked-work-inset");
        expect(
            within(inset).getByRole("heading", { name: "Zero is not a substitute for evidence" }),
        ).toBeInTheDocument();
        expect(inset).toHaveTextContent("does not show that no work is blocked");
    });

    it("the section head action is 'Return to investigation' (ghost, arrow first) to the Flow tab with the role", async () => {
        await renderExplore({ metric: "blocked_work", role: "manager" });
        const section = within(screen.getByTestId("blocked-work-evidence"));
        const back = section.getByRole("link", { name: "Return to investigation" });
        expect(back.className).toContain("border-transparent");
        expect(back.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        const url = new URL(back.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/metrics");
        expect(url.searchParams.get("tab")).toBe("flow");
        expect(url.searchParams.get("role")).toBe("manager");
    });

    it("'Return to investigation' goes to a served internal origin (the Bottlenecks page), and rejects an external one", async () => {
        const { unmount } = await renderExplore({
            metric: "blocked_work",
            origin: "/bottleneck?tab=evidence",
        });
        expect(screen.getByRole("link", { name: "Return to investigation" })).toHaveAttribute(
            "href",
            "/bottleneck?tab=evidence",
        );
        unmount();
        await renderExplore({ metric: "blocked_work", origin: "//evil.example/x" });
        const href =
            screen.getByRole("link", { name: "Return to investigation" }).getAttribute("href") ??
            "";
        expect(href).not.toContain("evil");
        expect(new URL(href, "https://app.example").pathname).toBe("/metrics");
    });

    it("the served evidence shortcuts stay, last", async () => {
        await renderExplore({ metric: "blocked_work" });
        const shortcuts = screen.getByTestId("evidence-shortcuts");
        expect(follows(screen.getByTestId("blocked-work-evidence"), shortcuts)).toBe(true);
        expect(
            within(shortcuts)
                .getAllByRole("link")
                .map((l) => l.textContent),
        ).toEqual(["prs"]);
    });

    it("another metric keeps the metric evidence layout (no Blocked Work section)", async () => {
        explain.value = { ...FULL };
        await renderExplore({ metric: "cycle_time" });
        expect(screen.queryByTestId("blocked-work-evidence")).toBeNull();
        expect(screen.getByTestId("explore-context")).toBeInTheDocument();
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Evidence detail for the selected metric.",
            ),
        ).toBeInTheDocument();
    });
});
