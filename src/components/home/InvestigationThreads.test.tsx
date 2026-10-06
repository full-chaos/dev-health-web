import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import type { HomeResponse } from "@/lib/types";

import {
    COMPOUNDING_RISK_PLAIN_LINE,
    InvestigationThreads,
    LONG_FORM_TITLE,
    THREADS_DESCRIPTION,
} from "./InvestigationThreads";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/dashboard",
}));

afterEach(() => {
    vi.restoreAllMocks();
});

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const HOME = {
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
    summary: [
        {
            id: "s1",
            text: "Cycle time moved in the window.",
            evidence_link: "/api/v1/explain?metric=cycle_time",
        },
        {
            id: "s2",
            text: "Review latency rose.",
            evidence_link: "/api/v1/explain?metric=review_latency",
        },
    ],
    tiles: {
        understand: {
            title: "Understand",
            subtitle: "Flow stages",
            link: "/explore?view=understand",
        },
    },
    constraint: {
        title: "Review queues",
        claim: "Review queues are the constraint.",
        evidence: [{ label: "Queue age chart", link: "/api/v1/explain?metric=review_latency" }],
        experiments: ["Rebalance review rotation.", "Cap reviews per person."],
    },
    limiting_factor: {
        claim: "Review latency appears to be the current limiting factor.",
        why_it_matters: "It is the largest drag on delivery.",
        recommended_action: "Rebalance reviewers.",
        evidence_ref: "/api/v1/explain?metric=review_latency",
        confidence: "medium",
    },
    events: [
        {
            type: "deploy",
            ts: "2026-06-01T10:00:00Z",
            text: "Deployed the billing service.",
            link: "/api/v1/events/1",
        },
    ],
} as unknown as HomeResponse;

const draw = (home: HomeResponse | null = HOME, role = "em") =>
    render(<InvestigationThreads home={home} filters={filters} activeRole={role} />);

const rowIds = () =>
    [
        ...screen
            .getByTestId("investigation-threads")
            .querySelectorAll("[data-testid^='thread-row-']"),
    ].map((el) => el.getAttribute("data-testid"));

const openLongForm = async () => {
    await userEvent.click(
        within(screen.getByTestId("thread-row-recent-events")).getByRole("button", {
            name: `Inspect: ${LONG_FORM_TITLE}`,
        }),
    );
    return within(screen.getByRole("dialog", { name: "Evidence & Context" }));
};

// The Investigation threads block of Home (CHAOS-8064): approved prototype `.worklist`.
describe("InvestigationThreads rows", () => {
    it("has the heading, the description and exactly the four approved rows in order", () => {
        draw();
        expect(screen.getByRole("heading", { name: "Investigation threads" })).toBeInTheDocument();
        expect(screen.getByText(THREADS_DESCRIPTION)).toBeInTheDocument();
        expect(rowIds()).toEqual([
            "thread-row-key-shifts",
            "thread-row-investment-mix",
            "thread-row-compounding-risk",
            "thread-row-recent-events",
        ]);
        expect(
            ["Key shifts", "Investment mix", "Compounding risk", LONG_FORM_TITLE].map(
                (name) => screen.getByRole("heading", { name }).tagName,
            ),
        ).toEqual(["H3", "H3", "H3", "H3"]);
    });

    it("each row has ONE action, 'Inspect', named for its row", () => {
        draw();
        const block = within(screen.getByTestId("investigation-threads"));
        expect(block.getAllByText("Inspect")).toHaveLength(4);
        expect(block.getAllByRole("link")).toHaveLength(3);
        expect(block.getAllByRole("button")).toHaveLength(1);
    });

    it.each([
        ["Key shifts", buildExploreUrl({ filters, role: "pm" })],
        ["Investment mix", withFilterParam("/investment", filters, "pm")],
        ["Compounding risk", withFilterParam("/risk/compounding", filters, "pm")],
    ])("%s: Inspect goes to its view with the filter and the role", (title, href) => {
        draw(HOME, "pm");
        expect(screen.getByRole("link", { name: `Inspect: ${title}` })).toHaveAttribute(
            "href",
            href,
        );
    });

    it("rows are flat: no disclosure, and no long-form block in the page body", () => {
        draw();
        const block = screen.getByTestId("investigation-threads");
        expect(block.querySelector("details")).toBeNull();
        expect(screen.queryByTestId("home-long-form")).toBeNull();
        for (const heading of ["Notable shifts", "Limiting factor", "Recent events"]) {
            expect(screen.queryByRole("heading", { name: heading })).toBeNull();
        }
        expect(block).not.toHaveTextContent("Deployed the billing service.");
        expect(block).not.toHaveTextContent("Review latency rose.");
    });

    it("the Compounding risk row keeps its plain line, with no number, when no risk signal is served", () => {
        draw();
        const row = screen.getByTestId("thread-row-compounding-risk");
        expect(row).toHaveTextContent(COMPOUNDING_RISK_PLAIN_LINE);
        expect(row.textContent).not.toMatch(/\d/);
    });

    it("the Compounding risk row names the served risk signals: served values and served confidence words", () => {
        const risk = (id: string, current_value: string) => ({
            id,
            title: `Compounding risk appears elevated for ${id}`,
            metric: "compounding_risk",
            current_value,
            prior_value: null,
            delta: null,
            direction: "flat",
            severity: "medium",
            confidence: "low",
            affected_scope: "repos",
            evidence_count: 1,
            why_it_matters: "w",
            recommended_action: "a",
            category: "durability",
        });
        draw({
            ...HOME,
            signals: [
                { ...risk("m", "1.4 days"), metric: "cycle_time" },
                risk("a", "63.9 %"),
                risk("b", "63.9 %"),
                risk("c", "50.0 %"),
                risk("d", "50.0 %"),
            ],
        } as HomeResponse);
        const row = screen.getByTestId("thread-row-compounding-risk");
        expect(row).toHaveTextContent(
            "Risk signals: 63.9 %, 63.9 %, 50.0 %, and 1 more, each with low confidence.",
        );
        // The metric signal's value is not a risk value; the entity names are not in the line.
        expect(row).not.toHaveTextContent("1.4 days");
        expect(row).not.toHaveTextContent("appears elevated");
        // The row's one action still goes to the Compounding Risk view.
        expect(screen.getByRole("link", { name: "Inspect: Compounding risk" })).toHaveAttribute(
            "href",
            withFilterParam("/risk/compounding", filters, "em"),
        );
    });

    it("the fourth row's line is the served limiting-factor claim, then the constraint claim, then the waiting text", () => {
        const first = draw();
        expect(screen.getByTestId("thread-row-recent-events")).toHaveTextContent(
            "Review latency appears to be the current limiting factor.",
        );
        first.unmount();
        const second = draw({ ...HOME, limiting_factor: undefined } as HomeResponse);
        expect(screen.getByTestId("thread-row-recent-events")).toHaveTextContent(
            "Review queues are the constraint.",
        );
        second.unmount();
        draw(null);
        expect(screen.getByTestId("thread-row-recent-events")).toHaveTextContent(
            "Evidence will appear once data is ingested.",
        );
    });
});

describe("InvestigationThreads long-form drawer", () => {
    it("the fourth row opens the ONE shared drawer with the long-form sections", async () => {
        draw();
        expect(screen.queryByRole("dialog")).toBeNull();
        const drawer = await openLongForm();

        expect(drawer.getByTestId("evidence-subject")).toHaveTextContent(LONG_FORM_TITLE);
        expect(
            ["Notable shifts", "Investigation threads", "Limiting factor", "Recent events"].map(
                (name) => drawer.getByRole("heading", { name }).tagName,
            ),
        ).toEqual(["H4", "H4", "H4", "H4"]);
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("Notable shifts: one button per served sentence; it opens that sentence's evidence in the same drawer", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 200 }));
        draw();
        const drawer = await openLongForm();
        expect(drawer.getByText("Short shifts from the selected window.")).toBeInTheDocument();
        expect(
            drawer.getByRole("button", { name: "Cycle time moved in the window." }),
        ).toBeInTheDocument();

        await userEvent.click(drawer.getByRole("button", { name: "Review latency rose." }));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/v1/explain");
        // Still one drawer; its subject is now the sentence's evidence.
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("Notable Shift");
    });

    it("Notable shifts and Recent events: the empty texts when the API served none", async () => {
        draw({ ...HOME, summary: [], events: [] } as HomeResponse);
        const drawer = await openLongForm();
        expect(drawer.getByText("Summary will appear once data is ingested.")).toBeInTheDocument();
        expect(
            drawer.getByText("No major shifts detected in the current window."),
        ).toBeInTheDocument();
    });

    it("Investigation threads: View all link, the served tiles, and the Focus thread link", async () => {
        draw();
        const drawer = await openLongForm();
        expect(drawer.getByRole("link", { name: "View all" })).toHaveAttribute(
            "href",
            withFilterParam("/opportunities", filters, "em"),
        );
        expect(drawer.getByRole("button", { name: /Understand Flow stages/ })).toBeInTheDocument();
        const focus = drawer.getByRole("link", { name: /Focus thread/ });
        expect(focus).toHaveAttribute("href", withFilterParam("/opportunities", filters, "em"));
        expect(focus).toHaveTextContent("Review queues");
        expect(focus).toHaveTextContent("Review queues are the constraint.");
    });

    it("Investigation threads: a tile opens its thread's evidence request in the same drawer", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 200 }));
        draw();
        const drawer = await openLongForm();
        await userEvent.click(drawer.getByRole("button", { name: /Understand Flow stages/ }));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        const url = new URL(String(fetchSpy.mock.calls[0][0]), "http://local");
        expect(url.pathname).toBe("/api/v1/home");
        expect(url.searchParams.get("thread")).toBe("understand");
        expect(url.searchParams.get("range_days")).toBe("30");
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("Understand");
    });

    it("Investigation threads: the pending texts when there is no constraint data", async () => {
        draw(null);
        const drawer = await openLongForm();
        const focus = drawer.getByRole("link", { name: /Focus thread/ });
        expect(focus).toHaveTextContent("Constraint pending");
        expect(focus).toHaveTextContent("Limiting factor pending.");
    });

    it("opens the no-data Home drawer when the served constraint is null", async () => {
        draw({
            ...HOME,
            summary: [],
            tiles: {},
            constraint: null,
            limiting_factor: undefined,
            events: [],
        } as HomeResponse);

        expect(screen.getByTestId("thread-row-recent-events")).toHaveTextContent(
            "Evidence will appear once data is ingested.",
        );
        const drawer = await openLongForm();
        const threads = drawer.getByTestId("long-form-threads");
        const limiting = drawer.getByTestId("long-form-limiting-factor");

        expect(threads).toHaveTextContent("Constraint pending");
        expect(threads).toHaveTextContent("Limiting factor pending.");
        expect(limiting).toHaveTextContent("Evidence will appear once data is ingested.");
        expect(within(limiting).queryAllByRole("button")).toHaveLength(1);
    });

    it("Limiting factor: claim, why, recommended action, evidence buttons, experiment chips, and the evidence opener", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 200 }));
        draw();
        const drawer = await openLongForm();
        const section = within(drawer.getByTestId("long-form-limiting-factor"));
        expect(
            section.getByText("Review latency appears to be the current limiting factor."),
        ).toBeInTheDocument();
        expect(section.getByText("It is the largest drag on delivery.")).toBeInTheDocument();
        expect(section.getByText("Recommended action")).toBeInTheDocument();
        expect(section.getByText("Rebalance reviewers.")).toBeInTheDocument();
        expect(section.getByRole("button", { name: "Queue age chart" })).toBeInTheDocument();
        expect(section.getByText("Rebalance review rotation.")).toBeInTheDocument();
        expect(section.getByText("Cap reviews per person.")).toBeInTheDocument();

        await userEvent.click(section.getByRole("button", { name: "Open evidence" }));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("Limiting Factor");
    });

    it("Limiting factor: falls back to the constraint claim, then to the waiting text", async () => {
        const first = draw({ ...HOME, limiting_factor: undefined } as HomeResponse);
        let drawer = await openLongForm();
        expect(
            within(drawer.getByTestId("long-form-limiting-factor")).getByText(
                "Review queues are the constraint.",
            ),
        ).toBeInTheDocument();
        first.unmount();

        draw(null);
        drawer = await openLongForm();
        expect(
            within(drawer.getByTestId("long-form-limiting-factor")).getByText(
                "Evidence will appear once data is ingested.",
            ),
        ).toBeInTheDocument();
    });

    it("Recent events: the Open evidence link with the role and the filter, and one button per served event", async () => {
        draw();
        const drawer = await openLongForm();
        const section = within(drawer.getByTestId("long-form-recent-events"));
        expect(section.getByRole("link", { name: "Open evidence" })).toHaveAttribute(
            "href",
            buildExploreUrl({ filters, role: "em" }),
        );
        expect(
            section.getByRole("button", { name: /Deployed the billing service\./ }),
        ).toBeInTheDocument();
    });

    it("scrubs an unresolved identifier from a notable-shift sentence", async () => {
        const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
        draw({
            ...HOME,
            summary: [{ id: "s1", text: `Risk rose for ${uuid}.`, evidence_link: "/api/x" }],
        } as HomeResponse);
        const drawer = await openLongForm();
        const section = drawer.getByTestId("long-form-notable-shifts");
        expect(section.textContent ?? "").not.toContain(uuid);
        expect(section).toHaveTextContent("Risk rose for #3f2504e0.");
    });
});
