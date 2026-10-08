import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal, HomeResponse } from "@/lib/types";

import { CockpitSummary } from "./CockpitSummary";

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

const topSignal: CockpitSignal = {
    id: "metric:review_latency",
    title: "Review Latency appears up",
    metric: "review_latency",
    current_value: "0.9 hours",
    prior_value: "0.1 hours",
    delta: "+1,041%",
    direction: "up",
    severity: "critical",
    confidence: "medium",
    affected_scope: "3 repos · payments",
    evidence_count: 7,
    why_it_matters: "Longer reviews suggest delivery may wait on review capacity.",
    recommended_action: "Rebalance reviewer rotation and clear stale review queues.",
    evidence_ref: "/api/home/explain/review_latency",
    category: "delivery",
};

const makeHome = (overrides: Partial<HomeResponse> = {}): HomeResponse => ({
    freshness: {
        last_ingested_at: null,
        sources: {},
        coverage: {
            repos_covered_pct: 0,
            prs_linked_to_issues_pct: 0,
            issues_with_cycle_states_pct: 0,
        },
    },
    deltas: [],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
    health_state: {
        status: "at_risk",
        headline: "Review latency is the limiting factor this week",
        summary: "Reviews are taking longer and slowing delivery.",
    },
    signals: [topSignal],
    ...overrides,
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// The primary-signal hero of Home (CHAOS-8063): approved prototype `hero(...)`, `app.js:100`.
describe("CockpitSummary primary-signal hero", () => {
    it("shows the top signal as served: severity, title, change, window, current from previous", () => {
        render(<CockpitSummary home={makeHome()} filters={filters} />);

        const hero = within(screen.getByTestId("cockpit-summary"));
        expect(hero.getByText("Primary signal")).toBeInTheDocument();
        expect(hero.getByTestId("area-signal-badge")).toHaveTextContent("Critical");
        // A section heading right under the page title (h1): no level is skipped.
        expect(hero.getByRole("heading", { name: "Review Latency appears up" }).tagName).toBe("H2");
        // The big value is the served change string, not a number the web made.
        expect(hero.getByTestId("area-signal-value").textContent).toBe("+1,041%");
        expect(hero.getByText("vs previous 90 days")).toBeInTheDocument();
        expect(hero.getByTestId("area-signal-driver").textContent).toBe("0.9 hours from 0.1 hours");
    });

    it("states the comparison window the page asked for, with the singular for one day", () => {
        render(
            <CockpitSummary
                home={makeHome()}
                filters={{ ...filters, time: { range_days: 7, compare_days: 1 } } as MetricFilter}
            />,
        );
        expect(screen.getByText("vs previous 1 day")).toBeInTheDocument();
    });

    it("writes only the current value when the API served no previous value", () => {
        render(
            <CockpitSummary
                home={makeHome({ signals: [{ ...topSignal, prior_value: null }] })}
                filters={filters}
            />,
        );
        expect(screen.getByTestId("area-signal-driver").textContent).toBe("0.9 hours");
    });

    it("renders the served no-data state apart from no findings or a failed read", () => {
        render(
            <CockpitSummary
                home={makeHome({
                    health_state: { status: "no_data", headline: "", summary: "" },
                    signals: [],
                })}
                filters={filters}
            />,
        );

        const state = screen.getByTestId("cockpit-no-data");
        expect(state).toHaveAttribute("data-variant", "no-data-window");
        expect(state).toHaveTextContent("No data");
        expect(state).toHaveTextContent("No data for this window.");
        expect(screen.queryByTestId("cockpit-top-change-empty")).toBeNull();
    });

    it("draws no big value when the API served no change (never a made-up number)", () => {
        render(
            <CockpitSummary
                home={makeHome({ signals: [{ ...topSignal, delta: null }] })}
                filters={filters}
            />,
        );
        expect(screen.queryByTestId("area-signal-value")).toBeNull();
    });

    it("has ONE action, the approved 'Open evidence' button, and no link", () => {
        render(<CockpitSummary home={makeHome()} filters={filters} />);
        const hero = within(screen.getByTestId("cockpit-summary"));
        expect(hero.getAllByRole("button")).toHaveLength(1);
        expect(hero.getByRole("button", { name: "Open evidence" })).toBe(
            screen.getByTestId("cockpit-top-change-evidence"),
        );
        expect(hero.queryAllByRole("link")).toHaveLength(0);
    });

    it("shows nothing the prototype hero does not have: no health chip, headline or action box", () => {
        render(<CockpitSummary home={makeHome()} filters={filters} />);
        const hero = screen.getByTestId("cockpit-summary");
        expect(screen.queryByTestId("cockpit-health-status")).toBeNull();
        expect(screen.queryByTestId("cockpit-headline")).toBeNull();
        expect(hero).not.toHaveTextContent("Review latency is the limiting factor this week");
        expect(hero).not.toHaveTextContent("Recommended action");
        expect(hero).not.toHaveTextContent("Rebalance reviewer rotation");
        expect(hero).not.toHaveTextContent("Longer reviews suggest");
    });

    it("opens the shared evidence drawer for the signal, with its served why and action first", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal("fetch", fetchMock);
        render(<CockpitSummary home={makeHome()} filters={filters} />);

        expect(screen.queryByRole("dialog")).toBeNull();
        await userEvent.click(screen.getByTestId("cockpit-top-change-evidence"));

        const drawer = within(screen.getByRole("dialog", { name: "Evidence & Context" }));
        expect(drawer.getByTestId("evidence-subject")).toHaveTextContent(
            "Review Latency appears up",
        );
        const intro = within(drawer.getByTestId("signal-evidence-intro"));
        expect(intro.getByTestId("signal-scope")).toHaveTextContent("3 repos · payments");
        expect(intro.getByTestId("signal-why").textContent).toBe(
            "Longer reviews suggest delivery may wait on review capacity.",
        );
        expect(intro.getByTestId("signal-recommended-action").textContent).toBe(
            "Rebalance reviewer rotation and clear stale review queues.",
        );
        // The served evidence_ref drives the request.
        expect(fetchMock).toHaveBeenCalledWith("/api/home/explain/review_latency");
    });

    it("falls back to a trust-preserving state when there are no signals", () => {
        render(<CockpitSummary home={makeHome({ signals: [] })} filters={filters} />);
        expect(screen.getByTestId("cockpit-top-change-empty")).toBeInTheDocument();
        expect(screen.queryByTestId("area-signal-card")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("renders the same safe state when home is null", () => {
        render(<CockpitSummary home={null} filters={filters} />);
        expect(screen.getByTestId("cockpit-top-change-empty")).toBeInTheDocument();
    });

    const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const HASH32 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

    it("never renders a raw hash as the hero title", () => {
        render(
            <CockpitSummary
                home={makeHome({ signals: [{ ...topSignal, title: HASH32 }] })}
                filters={filters}
            />,
        );
        const hero = screen.getByTestId("cockpit-summary");
        expect(hero.textContent ?? "").not.toContain(HASH32);
        expect(hero).toHaveTextContent("an unresolved item");
    });

    it("scrubs a UUID embedded in the served title (CHAOS-2064)", () => {
        render(
            <CockpitSummary
                home={makeHome({
                    signals: [{ ...topSignal, title: `Compounding risk appears high for ${UUID}` }],
                })}
                filters={filters}
            />,
        );
        const hero = screen.getByTestId("cockpit-summary");
        expect(hero.textContent ?? "").not.toContain(UUID);
        expect(hero).toHaveTextContent("Compounding risk appears high for an unresolved item");
    });

    it("shows the server-resolved scope name in the drawer, not its id", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        render(
            <CockpitSummary
                home={makeHome({
                    signals: [
                        {
                            ...topSignal,
                            scope_entity: { id: UUID, display_name: "payments-api" },
                        },
                    ],
                })}
                filters={filters}
            />,
        );
        await userEvent.click(screen.getByTestId("cockpit-top-change-evidence"));
        const scope = screen.getByTestId("signal-scope");
        expect(scope).toHaveTextContent("payments-api");
        expect(scope.textContent ?? "").not.toContain(UUID);
    });
});

describe("CockpitSummary hero look", () => {
    it.each([
        ["critical", "border-l-(--accent-negative)"],
        ["high", "border-l-(--accent-3)"],
        ["medium", "border-l-(--accent-2)"],
        ["low", "border-l-(--ink-muted)"],
    ] as const)(
        "%s severity has its edge and the state in words, no gradient",
        (severity, edge) => {
            render(
                <CockpitSummary
                    home={makeHome({ signals: [{ ...topSignal, severity }] })}
                    filters={filters}
                />,
            );
            const card = screen.getByTestId("area-signal-card");
            expect(card.className).toContain(edge);
            expect(card.className).not.toContain("gradient");
            expect(screen.getByTestId("area-signal-badge").textContent).toMatch(/\S/);
        },
    );
});
