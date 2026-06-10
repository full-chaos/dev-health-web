import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { HomeResponse } from "@/lib/types";

import { CockpitClient } from "./CockpitClient";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/",
}));

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30, compare_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
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
    deltas: [
        { metric: "cycle_time", label: "Cycle Time", value: 48, unit: "hours", delta_pct: -12, spark: [] },
        { metric: "review_latency", label: "Review Latency", value: 6, unit: "hours", delta_pct: -5, spark: [] },
        { metric: "wip", label: "WIP", value: 8, unit: "items", delta_pct: 10, spark: [] },
        { metric: "churn", label: "Code Churn", value: 18, unit: "%", delta_pct: 3, spark: [] },
    ],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
    ...overrides,
});

describe("CockpitClient — Key Shifts row", () => {
    it("renders the Key Shifts section heading", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="ic" />);
        expect(screen.getByTestId("key-shifts-row")).toBeInTheDocument();
        expect(screen.getByText(/Key Shifts/i)).toBeInTheDocument();
    });

    it("renders a card for each delta", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="ic" />);
        expect(screen.getByText("Cycle Time")).toBeInTheDocument();
        expect(screen.getByText("Review Latency")).toBeInTheDocument();
        expect(screen.getByText("WIP")).toBeInTheDocument();
        expect(screen.getByText("Code Churn")).toBeInTheDocument();
    });

    it("shows no-data-connected when deltas are empty and no sources are connected", () => {
        // makeHome() has freshness.sources: {} → no sources → no-data-connected
        render(<CockpitClient home={makeHome({ deltas: [] })} filters={filters} activeRole="ic" />);
        expect(screen.getByTestId("data-state-no-data-connected")).toBeInTheDocument();
    });

    it("shows detector-enabled-no-findings when sources are present but deltas are empty", () => {
        const homeWithSources = makeHome({
            deltas: [],
            freshness: {
                last_ingested_at: null,
                sources: { github: "ok" },
                coverage: { repos_covered_pct: 80, prs_linked_to_issues_pct: 0, issues_with_cycle_states_pct: 0 },
            },
        });
        render(<CockpitClient home={homeWithSources} filters={filters} activeRole="ic" />);
        expect(screen.getByTestId("data-state-detector-enabled-no-findings")).toBeInTheDocument();
        expect(screen.queryByTestId("data-state-no-data-connected")).not.toBeInTheDocument();
    });

    it("shows no-data-connected when home is null", () => {
        render(<CockpitClient home={null} filters={filters} activeRole="ic" />);
        expect(screen.getByTestId("data-state-no-data-connected")).toBeInTheDocument();
    });

    it("em role surfaces wip delta first (wip is lead in em investigationOrder)", () => {
        // em order: ["wip", "review", "cycle", "investment"]
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="em" />);
        const cards = screen.getByTestId("key-shifts-grid").querySelectorAll("a");
        // First card should be WIP (wip category leads for em)
        expect(cards[0]).toHaveTextContent("WIP");
    });

    it("ic role surfaces review delta first (review is lead in ic investigationOrder)", () => {
        // ic order: ["review", "cycle", "churn", "investment"]
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="ic" />);
        const cards = screen.getByTestId("key-shifts-grid").querySelectorAll("a");
        // First card should be Review Latency (review category leads for ic)
        expect(cards[0]).toHaveTextContent("Review Latency");
    });

    it("each delta card link includes metric=, role=, and f= params (scope-loss regression guard)", () => {
        render(<CockpitClient home={makeHome()} filters={filters} activeRole="em" />);
        const firstCard = screen
            .getByTestId("key-shifts-grid")
            .querySelector("a[href*='metric=wip']");
        expect(firstCard).not.toBeNull();
        expect(firstCard).toHaveAttribute("href", expect.stringContaining("/explore"));
        expect(firstCard).toHaveAttribute("href", expect.stringContaining("metric=wip"));
        expect(firstCard).toHaveAttribute("href", expect.stringContaining("role=em"));
        // f= must be present — dropping it loses the user's scope/time filter context.
        expect(firstCard).toHaveAttribute("href", expect.stringContaining("f="));
    });
});
