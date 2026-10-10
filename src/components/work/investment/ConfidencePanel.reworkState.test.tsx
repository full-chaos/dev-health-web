import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen, within } from "@/test/utils";

import { ConfidencePanel } from "./ConfidencePanel";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("./AllocationCoverage", () => ({ AllocationCoverage: () => null }));
vi.mock("./EvidenceQualityBands", () => ({ EvidenceQualityBands: () => null }));

// CHAOS-9074: the Investment confidence tile reads the same state as every other rework surface.
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
    return within(screen.getByTestId("confidence-tile-rework")).getByTestId("metric-value");
};

describe("Investment confidence rework tile", () => {
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
    });
});
