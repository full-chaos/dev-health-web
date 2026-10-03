import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { OverviewView, type LoadKpi } from "./CognitiveLoadViews";

/**
 * CHAOS-7618 pin: every string the production Overview shows. The page pass moves
 * the markup (tiles, chips, "How to read this" card); none of these strings may change.
 */
const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;

const signals: LoadKpi[] = [
    {
        label: "PR interruption load",
        value: "12",
        delta: "2026-05-01 – 2026-05-31",
        deltaTone: "text-(--ink-muted)",
        interpretation: "Watch",
        description:
            "Reviews, first-review events, and review feedback interrupting focused delivery.",
    },
    {
        label: "Context spread",
        value: "7",
        delta: "avg over 31 days",
        deltaTone: "text-(--caution)",
        interpretation: "Watch",
        description:
            "Distinct repos, PRs, reviews, and touched file areas in the selected team scope.",
    },
    {
        label: "Review request load",
        value: "4",
        delta: "avg over 31 days",
        deltaTone: "text-(--ink-muted)",
        interpretation: "Low",
        description:
            "Aggregate review requests handled by the team, never a person-level queue ranking.",
    },
    {
        label: "After-hours trend",
        value: "18%",
        delta: "team-scoped",
        deltaTone: "text-(--ink-muted)",
        interpretation: "Stable",
        description: "Existing commit-time rollups outside weekday business hours.",
    },
    {
        label: "Weekend trend",
        value: "—",
        delta: "no team scope",
        deltaTone: "text-(--positive)",
        interpretation: "N/A",
        description: "Existing weekend activity ratio, aggregated before it reaches this surface.",
    },
];
const window = { sinceDate: "2026-05-01", untilDate: "2026-05-31" };

describe("Overview strings (pin)", () => {
    it("keeps the section head and the Open evidence link; the 'Interpretive load view' eyebrow and the 'Team signal' pill are not in the approved layout", () => {
        render(
            <OverviewView
                signals={signals}
                window={window}
                filters={filters}
                activeRole="engineer"
                trend={[]}
            />,
        );
        expect(screen.queryByText("Interpretive load view")).toBeNull();
        expect(screen.getByText("What is pulling attention apart?")).toBeInTheDocument();
        expect(screen.queryByText("Team signal")).toBeNull();
        expect(screen.getByRole("link", { name: "Open evidence" })).toBeInTheDocument();
        expect(
            screen.getByText(
                /Read these as pressure cues\. The values point to review load, context spread, and time-boundary strain/u,
            ),
        ).toBeInTheDocument();
    });

    it("keeps every tile string: label, value, delta, interpretation, description", () => {
        render(
            <OverviewView
                signals={signals}
                window={window}
                filters={filters}
                activeRole="engineer"
                trend={[]}
            />,
        );
        for (const s of signals) {
            expect(screen.getByText(s.label), s.label).toBeInTheDocument();
            expect(screen.getAllByText(s.value).length, s.value).toBeGreaterThan(0);
            expect(screen.getAllByText(s.delta).length, s.delta).toBeGreaterThan(0);
            expect(screen.getAllByText(s.interpretation).length, s.interpretation).toBeGreaterThan(
                0,
            );
            expect(screen.getByText(s.description), s.description).toBeInTheDocument();
        }
    });

    it("keeps the aggregation contract text word for word", () => {
        render(
            <OverviewView
                signals={signals}
                window={window}
                filters={filters}
                activeRole="engineer"
                trend={[]}
            />,
        );
        expect(screen.getByText("Aggregation contract")).toBeInTheDocument();
        expect(screen.getByText("Team/repo-first by default")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Cognitive-load signals are presented as system pressure: review queues, context spread, after-hours trend, and weekend trend. They are coaching prompts, not performance judgments. Open the Context Switching, Focus Pressure, and Load Drivers tabs to see each signal broken out over the window.",
            ),
        ).toBeInTheDocument();
    });

    it("keeps the empty state text when there are no signals", () => {
        render(<OverviewView signals={null} window={window} filters={filters} trend={[]} />);
        expect(screen.getByText("No data for this window")).toBeInTheDocument();
        expect(screen.getByText(/No cognitive-load signals found for/u)).toBeInTheDocument();
        expect(
            screen.getByText(/Try widening the date range or switching to a team scope\./u),
        ).toBeInTheDocument();
    });
});
