import { fireEvent, render, screen, waitFor } from "@/test/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import type { HomeResponse } from "@/lib/types";

import { CockpitClient } from "./CockpitClient";

// Pin tests for the lower Home sections (CHAOS-7739, 5.1c): Notable shifts, Investigation threads,
// Limiting factor, Recent events. Written green on the code before they become closed rows, and
// kept green after (content, links and behaviour unchanged).

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/",
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
        claim: "Review latency is the limiting factor.",
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
    render(<CockpitClient home={home} filters={filters} activeRole={role} />);

describe("lower Home sections pinned (CHAOS-7739)", () => {
    it("Notable shifts: heading, line, one button per sentence that opens the panel with its evidence link", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 200 }));
        draw();
        expect(screen.getByRole("heading", { name: "Notable shifts" })).toBeInTheDocument();
        expect(screen.getByText("Short shifts from the selected window.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Review latency rose." }));
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/v1/explain");
        expect(
            screen.getByRole("button", { name: "Cycle time moved in the window." }),
        ).toBeInTheDocument();
    });

    it("Notable shifts: the empty text when there is no summary", () => {
        draw({ ...HOME, summary: [] } as HomeResponse);
        expect(
            screen.getAllByText("Summary will appear once data is ingested.").length,
        ).toBeGreaterThanOrEqual(1);
    });

    it("Investigation threads: heading, View all link, tiles, and the Focus thread link", () => {
        draw();
        expect(screen.getByRole("heading", { name: "Investigation threads" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
            "href",
            withFilterParam("/opportunities", filters, "em"),
        );
        expect(screen.getByRole("button", { name: /Understand Flow stages/ })).toBeInTheDocument();
        const focus = screen.getByRole("link", { name: /Focus thread/ });
        expect(focus).toHaveAttribute("href", withFilterParam("/opportunities", filters, "em"));
        expect(focus).toHaveTextContent("Review queues");
        expect(focus).toHaveTextContent("Review queues are the constraint.");
    });

    it("Investigation threads: the pending texts when there is no constraint data", () => {
        draw(null);
        const focus = screen.getByRole("link", { name: /Focus thread/ });
        expect(focus).toHaveTextContent("Constraint pending");
        expect(focus).toHaveTextContent("Limiting factor pending.");
    });

    it("Limiting factor: claim, why, recommended action, evidence buttons, experiment chips, and the evidence opener", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 200 }));
        draw();
        expect(screen.getByRole("heading", { name: "Limiting factor" })).toBeInTheDocument();
        expect(
            screen.getAllByText("Review latency is the limiting factor.").length,
        ).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("It is the largest drag on delivery.")).toBeInTheDocument();
        expect(screen.getByText("Recommended action")).toBeInTheDocument();
        expect(screen.getByText("Rebalance reviewers.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Queue age chart" })).toBeInTheDocument();
        expect(screen.getByText("Rebalance review rotation.")).toBeInTheDocument();
        expect(screen.getByText("Cap reviews per person.")).toBeInTheDocument();
        const openers = screen.getAllByRole("button", { name: "Open evidence" });
        fireEvent.click(openers[0]);
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    });

    it("Limiting factor: falls back to the constraint claim, then to the waiting text", () => {
        const { unmount } = draw({ ...HOME, limiting_factor: undefined } as HomeResponse);
        expect(
            screen.getAllByText("Review queues are the constraint.").length,
        ).toBeGreaterThanOrEqual(2);
        unmount();
        draw(null);
        expect(
            screen.getAllByText("Evidence will appear once data is ingested.").length,
        ).toBeGreaterThanOrEqual(1);
    });

    it("Recent events: heading, the Open evidence link with the role and filter, one button per event, and the empty text", () => {
        const { unmount } = draw();
        expect(screen.getByRole("heading", { name: "Recent events" })).toBeInTheDocument();
        const links = screen.getAllByRole("link", { name: "Open evidence" });
        expect(
            links.some((a) => a.getAttribute("href") === buildExploreUrl({ filters, role: "em" })),
        ).toBe(true);
        expect(
            screen.getByRole("button", { name: /Deployed the billing service\./ }),
        ).toBeInTheDocument();
        unmount();
        draw({ ...HOME, events: [] } as HomeResponse);
        expect(
            screen.getAllByText("No major shifts detected in the current window.").length,
        ).toBeGreaterThanOrEqual(1);
    });
});
