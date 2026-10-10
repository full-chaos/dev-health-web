import { describe, expect, it } from "vitest";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen, within } from "@/test/utils";

import { QualityEvidenceTiles } from "./QualityEvidenceTiles";

// CHAOS-9074: the Quality "PR Rework Ratio" tile says why the ratio has no value.
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
    value: 0,
    unit: "%",
    delta_pct: 0,
    has_data: false,
    has_prior_data: true,
    spark: [],
    ...over,
});

const slot = (r: MetricDelta) => {
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
    return within(screen.getByTestId("quality-tile-pr_rework_ratio")).getByTestId("metric-value");
};

describe("Quality PR rework ratio tile", () => {
    it.each([
        ["unknown_no_review_evidence", "No review data for this window"],
        ["not_applicable_no_rework_signal", "Rework is not measurable for this provider"],
        ["not_applicable_no_merged_pull_requests", "No merged pull requests in this window"],
    ])("%s draws its text and no number", (state, text) => {
        const el = slot(row({ rate_state: state }));
        expect(el).toHaveAttribute("data-value-kind", "message");
        expect(el).toHaveTextContent(text);
        expect(el.textContent).not.toMatch(/\b0\s*%|^0/);
    });

    it("measured 0 draws 0", () => {
        const el = slot(row({ has_data: true, rate_state: "measured" }));
        expect(el).toHaveAttribute("data-value-kind", "value");
        expect(el).toHaveTextContent(/^0/);
    });

    it("an unknown future state draws No data for this window", () => {
        const el = slot(row({ rate_state: "something_new" }));
        expect(el).toHaveTextContent("No data for this window");
        expect(el.textContent).not.toContain("something_new");
    });
});
