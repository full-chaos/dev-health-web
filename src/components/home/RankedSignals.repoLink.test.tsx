import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal, MetricDelta } from "@/lib/types";

import { RankedSignals } from "./RankedSignals";

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

const signal = (metric: string, label: string): CockpitSignal => ({
    id: `metric:${metric}`,
    title: `${label} appears up`,
    metric,
    severity: "low",
    confidence: "medium",
    affected_scope: "org",
    evidence_count: 1,
    current_value: "1 days",
    prior_value: "1 days",
    delta: "+0%",
    direction: "flat",
    category: "delivery",
    why_it_matters: "",
    recommended_action: "",
    evidence_ref: `/api/home/explain/${metric}`,
});

const delta = (metric: string, over: Partial<MetricDelta>): MetricDelta => ({
    metric,
    label: metric,
    value: 1,
    unit: "days",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});

const draw = (cycle: Partial<MetricDelta>) =>
    render(
        <RankedSignals
            signals={[
                signal("review_latency", "Review Latency"),
                signal("cycle_time", "Cycle Time"),
            ]}
            deltas={[delta("review_latency", {}), delta("cycle_time", cycle)]}
            filters={filters}
        />,
    );

describe("Home ranked signals repository link note (CHAOS-9120)", () => {
    it("draws the tier sentence under the cycle time row only", () => {
        draw({
            repo_link_state: "linked",
            repo_link_basis: { native: 56, explicit_text: 7, heuristic: 32 },
        });
        const notes = screen.getAllByTestId("signal-repo-link-note");
        expect(notes).toHaveLength(1);
        expect(notes[0]).toHaveTextContent("56 native, 7 by text, 32 by heuristic.");
    });
    it("draws text 3 for timed_out", () => {
        draw({ has_data: false, value: 0, repo_link_state: "timed_out" });
        expect(screen.getByTestId("signal-repo-link-note")).toHaveTextContent(
            "This read took too long. No value is shown.",
        );
    });
    it("draws nothing without a state", () => {
        draw({});
        expect(screen.queryByTestId("signal-repo-link-note")).toBeNull();
    });
});
