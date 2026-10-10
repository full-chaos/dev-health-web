import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen } from "@/test/utils";

import { ConfidencePanel } from "./ConfidencePanel";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("./AllocationCoverage", () => ({ AllocationCoverage: () => null }));
vi.mock("./EvidenceQualityBands", () => ({ EvidenceQualityBands: () => null }));

// CHAOS-9076: the Investment confidence rework tile says how many merged pull requests it rests on.
const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const row = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "pr_rework_ratio",
    label: "PR Rework Ratio",
    value: 20,
    unit: "%",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    rate_state: "measured",
    spark: [],
    ...over,
});

const tile = (r: MetricDelta) => {
    render(
        <ConfidencePanel
            filters={filters}
            workUnits={[]}
            investmentMix={null}
            mixExplanation={{ data: null } as never}
            teamCategoryFlow={null}
            repoTeamFlow={null}
            isCategoryFlowLoading={false}
            reworkMetric={r}
        />,
    );
    return screen.getByTestId("confidence-tile-rework");
};

const NOTE = /Based on .* of merged pull requests/;

describe("Investment confidence rework tile coverage note", () => {
    it("draws the note at coverage 0.07", () => {
        expect(tile(row({ rate_coverage: 0.07 }))).toHaveTextContent(
            "Based on 7% of merged pull requests",
        );
    });

    it.each([[1], [null], [undefined]])("draws no note at coverage %s", (c) => {
        expect(tile(row({ rate_coverage: c })).textContent).not.toMatch(NOTE);
    });

    it.each([
        ["unknown_no_review_evidence", 0],
        ["not_applicable_no_rework_signal", 0],
        ["not_applicable_no_merged_pull_requests", 0.07],
    ])("draws no note beside the state text of %s", (state, coverage) => {
        const t = tile(
            row({ has_data: false, value: 0, rate_state: state, rate_coverage: coverage }),
        );
        expect(t.textContent).not.toMatch(NOTE);
    });
});
