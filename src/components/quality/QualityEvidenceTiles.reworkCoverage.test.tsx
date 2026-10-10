import { describe, expect, it } from "vitest";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen } from "@/test/utils";

import { QualityEvidenceTiles } from "./QualityEvidenceTiles";

// CHAOS-9076: the Quality "PR Rework Ratio" tile says how many merged pull requests it rests on.
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
        <EvidenceDrawerProvider>
            <QualityEvidenceTiles
                filters={filters}
                tiles={[
                    {
                        metric: "pr_rework_ratio",
                        label: "PR Rework Ratio",
                        row: r,
                        description: "PRs requiring rework",
                    },
                ]}
            />
        </EvidenceDrawerProvider>,
    );
    return screen.getByTestId("quality-tile-pr_rework_ratio");
};

const NOTE = /Based on .* of merged pull requests/;

describe("Quality PR rework ratio coverage note", () => {
    it("draws the note at coverage 0.07", () => {
        expect(tile(row({ rate_coverage: 0.07 }))).toHaveTextContent(
            "Based on 7% of merged pull requests",
        );
    });

    it("draws <1% under one percent", () => {
        expect(tile(row({ rate_coverage: 0.004 }))).toHaveTextContent(
            "Based on <1% of merged pull requests",
        );
    });

    it("draws 99% for a coverage that rounds to 100", () => {
        expect(tile(row({ rate_coverage: 0.996 }))).toHaveTextContent(
            "Based on 99% of merged pull requests",
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
        expect(t.textContent).not.toMatch(/\b0\s*%/);
    });
});
