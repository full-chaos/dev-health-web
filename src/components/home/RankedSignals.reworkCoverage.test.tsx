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

// CHAOS-9076: the Home ranked-signals row of the PR rework ratio says how many merged pull
// requests it rests on.
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
    current_value: "0 %",
    prior_value: "0 %",
    delta: "+0%",
    direction: "flat",
    category: "delivery",
    why_it_matters: "",
    recommended_action: "",
    evidence_ref: `/api/home/explain/${metric}`,
});

const delta = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "pr_rework_ratio",
    label: "PR Rework Ratio",
    value: 0,
    unit: "%",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    rate_state: "measured",
    spark: [],
    ...over,
});

const draw = (served: MetricDelta[]) =>
    render(
        <RankedSignals
            signals={[
                signal("review_latency", "Review Latency"),
                signal("pr_rework_ratio", "PR Rework Ratio"),
            ]}
            deltas={[delta({ metric: "review_latency", label: "Review Latency" }), ...served]}
            filters={filters}
        />,
    );

describe("Home ranked signals rework coverage note", () => {
    it("draws the note under the row at coverage 0.07", () => {
        draw([delta({ rate_coverage: 0.07 })]);
        expect(screen.getByTestId("signal-coverage-note")).toHaveTextContent(
            "Based on 7% of merged pull requests",
        );
    });

    it.each([[1], [null], [undefined]])("draws no note at coverage %s", (c) => {
        draw([delta({ rate_coverage: c })]);
        expect(screen.queryByTestId("signal-coverage-note")).toBeNull();
    });

    it("draws no note beside a state text (coverage 0)", () => {
        draw([
            delta({ has_data: false, rate_state: "unknown_no_review_evidence", rate_coverage: 0 }),
        ]);
        expect(screen.queryByTestId("signal-coverage-note")).toBeNull();
    });
});
