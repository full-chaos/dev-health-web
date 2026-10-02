import { render, screen, userEvent, waitFor, within } from "@/test/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { formatTimestamp } from "@/lib/formatters";

import { EvidenceDrawerProvider, useEvidenceDrawer } from "./EvidenceDrawerProvider";
import { EVIDENCE_SUPPORTING_TITLE } from "./EvidenceItems";
import { EvidencePanel } from "./EvidencePanel";

// The drawer body as the approved prototype (CHAOS-8187, `openEvidence`, `app.js:122`): subject,
// fact rows, ONE plain supporting section. Every value is served or reads "Not reported": the web
// names no source and grades no quality.

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

/** What the explain endpoint serves today: numbers and contributors, no provenance block. */
const EXPLAIN = {
    metric: "cycle_time",
    label: "Cycle Time",
    unit: "days",
    value: 1.4,
    delta_pct: 617.4,
    drivers: [
        {
            id: "repo-1",
            label: "dev-health-acr",
            value: 1.2,
            delta_pct: 40,
            evidence_link: "/explore?metric=cycle_time&scope=repo-1",
        },
    ],
    contributors: [
        {
            id: "repo-1",
            label: "dev-health-acr",
            value: 1.2,
            delta_pct: 40,
            evidence_link: "/explore?metric=cycle_time&scope=repo-1",
        },
        { id: "repo-2", label: "dev-health-ops", value: 0.8, delta_pct: -12, evidence_link: "" },
    ],
    drilldown_links: {},
};

const HOME = {
    freshness: {
        last_ingested_at: "2026-09-09T08:00:00Z",
        latest_successful_sync_at: "2026-09-09T10:30:00Z",
        sources: {},
        coverage: {
            repos_covered_pct: 100,
            prs_linked_to_issues_pct: 80,
            issues_with_cycle_states_pct: 60,
        },
    },
    deltas: [],
    summary: [
        { id: "s1", text: "Cycle time moved.", evidence_link: "/api/v1/explain?metric=cycle_time" },
    ],
    tiles: {},
    constraint: {
        title: "Review queues",
        claim: "Review queues are the constraint.",
        evidence: [],
        experiments: [],
    },
    events: [],
    health_state: {
        status: "watch",
        headline: "H",
        summary: "Delivery appears slower this window.",
    },
    data_confidence: {
        level: "high",
        coverage_pct: 92,
        connected_sources: [],
        missing_sources: [],
        caveats: [],
    },
};

const INVESTMENT = {
    theme_distribution: { feature_delivery: 0.6, maintenance: 0.4 },
    subcategory_distribution: {},
    evidence_quality_stats: { mean: 0.7 },
};

const OPPORTUNITIES = {
    items: [
        {
            id: "o1",
            title: "Rebalance review rotation",
            rationale: "Review queues appear long.",
            evidence_links: ["/explore?metric=review_latency"],
            suggested_experiments: ["Cap reviews per person."],
        },
    ],
};

const fact = (label: string) => {
    const row = screen
        .getAllByTestId("evidence-fact")
        .find((candidate) => within(candidate).queryByText(label, { selector: "dt" }));
    if (!row) throw new Error(`no fact row "${label}"`);
    return row.querySelector("dd") as HTMLElement;
};

const drawMetric = (props: Partial<Parameters<typeof EvidencePanel>[0]> = {}) =>
    render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Cycle Time appears up"
            metric="cycle_time"
            filters={filters}
            {...props}
        />,
    );

const drawFetched = (apiUrl: string, payload: unknown) => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );
    return render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Page"
            apiUrl={apiUrl}
            filters={filters}
        />,
    );
};

const loaded = () =>
    waitFor(() => expect(screen.getByTestId("evidence-facts")).toBeInTheDocument());

beforeEach(() => {
    mockGetExplainData.mockReset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("drawer values are served or read 'Not reported'", () => {
    it("an explain payload with no provenance block: no made source and no made quality", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();

        for (const label of ["Source", "Data quality", "Last sync", "Identity confidence"]) {
            expect(fact(label)).toHaveTextContent(/^Not reported$/);
        }
        const dialog = screen.getByRole("dialog");
        expect(dialog).not.toHaveTextContent(/metrics API/i);
        expect(dialog).not.toHaveTextContent(/moderate|partial data quality/i);
        // The served artifact count is still a real row.
        expect(fact("Artifacts")).toHaveTextContent("2 artifacts");
    });

    it("an explain payload with served top-level fields shows those, and only those", async () => {
        mockGetExplainData.mockResolvedValue({
            ...EXPLAIN,
            source: "served-source",
            identity_confidence: 0.5,
        });
        drawMetric();
        await loaded();
        expect(fact("Source")).toHaveTextContent("served-source");
        expect(fact("Identity confidence")).toHaveTextContent("50%");
        expect(fact("Data quality")).toHaveTextContent(/^Not reported$/);
        expect(fact("Last sync")).toHaveTextContent(/^Not reported$/);
    });

    it("the Home payload: served confidence level and served last successful sync, no source name", async () => {
        drawFetched("/api/v1/home?range_days=90", HOME);
        await loaded();
        expect(fact("Source")).toHaveTextContent(/^Not reported$/);
        expect(screen.getByRole("dialog")).not.toHaveTextContent(/home API/i);
        expect(fact("Data quality")).toHaveTextContent("High");
        // The last successful sync, not the ingest time (both are on the same day).
        expect(fact("Last sync").textContent).toBe(formatTimestamp("2026-09-09T10:30:00Z"));
        expect(formatTimestamp("2026-09-09T10:30:00Z")).not.toBe(
            formatTimestamp("2026-09-09T08:00:00Z"),
        );
    });

    it("the Home payload with no successful sync and no confidence: both rows read Not reported", async () => {
        drawFetched("/api/v1/home?range_days=90", {
            ...HOME,
            freshness: { ...HOME.freshness, latest_successful_sync_at: null },
            data_confidence: undefined,
        });
        await loaded();
        // An ingest time is not a sync; a missing level is not graded "partial".
        expect(fact("Last sync")).toHaveTextContent(/^Not reported$/);
        expect(fact("Data quality")).toHaveTextContent(/^Not reported$/);
    });

    it.each([
        ["Investment", "/api/v1/investment?range_days=90", INVESTMENT, /investment API/i],
        [
            "Opportunities",
            "/api/v1/opportunities?range_days=90",
            OPPORTUNITIES,
            /opportunities API/i,
        ],
    ])(
        "the %s payload: no source name and no quality word",
        async (_name, url, payload, literal) => {
            drawFetched(url, payload);
            await loaded();
            expect(fact("Source")).toHaveTextContent(/^Not reported$/);
            expect(fact("Data quality")).toHaveTextContent(/^Not reported$/);
            expect(screen.getByRole("dialog")).not.toHaveTextContent(literal);
        },
    );
});

describe("drawer body as the approved prototype", () => {
    it("has no CONTEXT card, no shift chip and no web-built sentence", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();
        const dialog = screen.getByRole("dialog");
        expect(dialog).not.toHaveTextContent(/Significant shift|Moderate shift/);
        expect(dialog).not.toHaveTextContent(/is up by|is down by|is flat by/);
        expect(within(dialog).queryByText("Context")).toBeNull();
        expect(within(dialog).queryByText("Supporting Evidence")).toBeNull();
        // No summary was served, so there is no summary paragraph.
        expect(within(dialog).queryByTestId("evidence-summary")).toBeNull();
    });

    it("shows the served value and the served change as two fact rows", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();
        const rows = within(screen.getByTestId("evidence-metric-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Value", "1.4 days"],
            ["Change", "+617%"],
        ]);
    });

    it("has no value rows for a payload that serves no metric number", async () => {
        drawFetched("/api/v1/home?range_days=90", HOME);
        await loaded();
        expect(screen.queryByTestId("evidence-metric-facts")).toBeNull();
    });

    it("shows a served summary as one plain paragraph", async () => {
        mockGetExplainData.mockResolvedValue({
            ...EXPLAIN,
            summary: "Cycle time appears higher in this window.",
        });
        drawMetric();
        await loaded();
        expect(screen.getByTestId("evidence-summary").textContent).toBe(
            "Cycle time appears higher in this window.",
        );
    });

    it("lists the supporting rows in ONE plain section: served name left, served value right", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();

        const section = within(screen.getByTestId("evidence-supporting"));
        expect(
            section.getByRole("heading", { name: EVIDENCE_SUPPORTING_TITLE }),
        ).toBeInTheDocument();
        // A driver that is also a contributor is one row.
        const rows = section.getAllByTestId("evidence-supporting-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "dev-health-acr1.2 days (+40%)",
            "dev-health-ops0.8 days (-12%)",
        ]);
        // No tag cards, no count chip (the count is the Artifacts row).
        expect(screen.getByTestId("evidence-supporting")).not.toHaveTextContent(/OTHER|artifacts/i);
    });

    it("a row with a served link is a link to it; a row without one is plain text", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();
        const section = within(screen.getByTestId("evidence-supporting"));
        expect(section.getByRole("link", { name: "dev-health-acr" })).toHaveAttribute(
            "href",
            "/explore?metric=cycle_time&scope=repo-1",
        );
        expect(section.queryByRole("link", { name: "dev-health-ops" })).toBeNull();
        expect(section.getByText("dev-health-ops")).toBeInTheDocument();
    });

    it("prefers the server-resolved display name of a contributor", async () => {
        mockGetExplainData.mockResolvedValue({
            ...EXPLAIN,
            drivers: [],
            contributors: [
                {
                    id: "c1",
                    label: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                    display_name: "Payments team",
                    value: 3,
                    delta_pct: 0,
                    evidence_link: "",
                },
            ],
        });
        drawMetric();
        await loaded();
        expect(screen.getByTestId("evidence-supporting-row")).toHaveTextContent("Payments team");
        expect(screen.getByRole("dialog")).not.toHaveTextContent("3f2504e0-4f89");
    });

    it("an item with a served kind and line shows them under its name", async () => {
        mockGetExplainData.mockResolvedValue({
            metric: "cycle_time",
            label: "Cycle Time",
            evidence: [
                {
                    id: "PR-1",
                    title: "Shorten review queue",
                    url: "/prs/PR-1",
                    type: "pr",
                    meta: "merged in 2d",
                },
            ],
            actions: [],
        });
        drawMetric();
        await loaded();
        expect(screen.getByTestId("evidence-supporting-row")).toHaveTextContent(
            "Shorten review queuePull request · merged in 2d",
        );
    });

    it("the footer is one primary button link, not a full-width strip", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        const link = await screen.findByRole("link", { name: /Open evidence/ });
        // The approved `btn()`: the icon first, then the text; the name is the text only.
        expect(link).toHaveAccessibleName("Open evidence");
        // The first NODE (not the first element) is the icon: no text stands before it.
        expect(link.firstChild?.nodeName.toLowerCase()).toBe("svg");
        expect(link.firstChild).toHaveAttribute("aria-hidden", "true");
        expect(link.lastChild?.textContent).toBe("Open evidence");
        expect(link.className).toContain("bg-(--action)");
        expect(link.className).not.toContain("w-full");
        expect(
            within(screen.getByRole("dialog")).getAllByRole("link", { name: /Open evidence/ }),
        ).toHaveLength(1);
    });
});

describe("Investment and Opportunities payloads", () => {
    it("Investment: each served theme share is one row, in order of size, with no sentence about them", async () => {
        drawFetched("/api/v1/investment?range_days=90", {
            ...INVESTMENT,
            theme_distribution: { maintenance: 0.25, feature_delivery: 0.6, quality: 0.15 },
        });
        await loaded();
        const rows = screen.getAllByTestId("evidence-supporting-row").map((row) => row.textContent);
        expect(rows).toEqual(["Feature Delivery60%", "Maintenance25%", "Quality15%"]);
        const dialog = screen.getByRole("dialog");
        expect(dialog).not.toHaveTextContent(/largest/i);
        expect(screen.queryByTestId("evidence-summary")).toBeNull();
    });

    it.each([
        [1, "1 opportunity matched the selected context."],
        [2, "2 opportunities matched the selected context."],
    ])("Opportunities: %i served item(s) read with the right plural", async (count, text) => {
        const item = OPPORTUNITIES.items[0];
        drawFetched("/api/v1/opportunities?range_days=90", {
            items: Array.from({ length: count }, (_, i) => ({ ...item, id: `o${i}` })),
        });
        await loaded();
        expect(screen.getByTestId("evidence-summary").textContent).toBe(text);
    });
});

describe("Recommended next steps: served actions only", () => {
    it("shows no next steps for an explain payload that serves no action (no definition fallback)", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        await loaded();
        expect(screen.queryByTestId("evidence-next-steps")).toBeNull();
        expect(screen.getByRole("dialog")).not.toHaveTextContent("Recommended next steps");
    });

    it("shows the served actions as plain rows in one plain section", async () => {
        mockGetExplainData.mockResolvedValue({
            ...EXPLAIN,
            actions: [
                { id: "a1", label: "Cap reviews per person.", type: "experiment" },
                { id: "a2", label: "Rebalance review rotation.", type: "process" },
            ],
        });
        drawMetric();
        await loaded();
        const section = within(screen.getByTestId("evidence-next-steps"));
        expect(
            section.getByRole("heading", { name: "Recommended next steps" }),
        ).toBeInTheDocument();
        expect(section.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
            "Cap reviews per person.",
            "Rebalance review rotation.",
        ]);
    });

    it("keeps the served experiments of the Home constraint as next steps", async () => {
        drawFetched("/api/v1/home?range_days=90", {
            ...HOME,
            constraint: { ...HOME.constraint, experiments: ["Set WIP limits per team."] },
        });
        await loaded();
        expect(screen.getByTestId("evidence-next-steps")).toHaveTextContent(
            "Set WIP limits per team.",
        );
    });

    it("keeps the served experiments of an Opportunities payload, and adds none to an Investment payload", async () => {
        const { unmount } = drawFetched("/api/v1/opportunities?range_days=90", OPPORTUNITIES);
        await loaded();
        expect(screen.getByTestId("evidence-next-steps")).toHaveTextContent(
            "Cap reviews per person.",
        );
        unmount();
        drawFetched("/api/v1/investment?range_days=90", INVESTMENT);
        await loaded();
        expect(screen.queryByTestId("evidence-next-steps")).toBeNull();
        expect(screen.getByRole("dialog")).not.toHaveTextContent(
            "Inspect the investment mix and compare it with current priorities.",
        );
    });
});

describe("the origin hint of a request subject", () => {
    const originOf = async () => {
        const link = await screen.findByRole("link", { name: /Open evidence/ });
        return new URL(link.getAttribute("href") ?? "", "http://local").searchParams.get("origin");
    };

    it("is on the footer link to Explore when the opener passes it", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric({ origin: "/landscape", role: "em" });
        const link = await screen.findByRole("link", { name: /Open evidence/ });
        const url = new URL(link.getAttribute("href") ?? "", "http://local");
        expect(url.pathname).toBe("/explore");
        expect(url.searchParams.get("origin")).toBe("/landscape");
        // The other parameters are unchanged.
        expect(url.searchParams.get("metric")).toBe("cycle_time");
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("f")).toBeTruthy();
    });

    it("is absent when the opener passes none", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        drawMetric();
        expect(await originOf()).toBeNull();
    });

    it.each([
        ["/api/v1/investment?range_days=90", INVESTMENT, "/investment"],
        ["/api/v1/opportunities?range_days=90", OPPORTUNITIES, "/opportunities"],
        ["/api/v1/home?range_days=90", HOME, "/explore"],
    ])("is kept on the footer link of %s", async (apiUrl, payload, pathname) => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
        );
        render(
            <EvidencePanel
                isOpen
                onCloseAction={() => undefined}
                title="Page"
                apiUrl={apiUrl}
                filters={filters}
                origin="/diagnose"
            />,
        );
        const link = await screen.findByRole("link", { name: /Open evidence/ });
        const url = new URL(link.getAttribute("href") ?? "", "http://local");
        expect(url.pathname).toBe(pathname);
        expect(url.searchParams.get("origin")).toBe("/diagnose");
    });

    it("goes from the subject through the provider to the one shared drawer", async () => {
        mockGetExplainData.mockResolvedValue(EXPLAIN);
        function Opener() {
            const evidence = useEvidenceDrawer();
            return (
                <button
                    type="button"
                    onClick={() =>
                        evidence.open({
                            title: "Cycle Time",
                            metric: "cycle_time",
                            filters,
                            origin: "/landscape",
                        })
                    }
                >
                    Open
                </button>
            );
        }
        render(
            <EvidenceDrawerProvider>
                <Opener />
            </EvidenceDrawerProvider>,
        );
        await userEvent.click(screen.getByRole("button", { name: "Open" }));
        expect(await originOf()).toBe("/landscape");
    });
});
