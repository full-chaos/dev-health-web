import { describe, expect, it } from "vitest";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen, within } from "@/test/utils";

import { QualityEvidenceTiles } from "./QualityEvidenceTiles";

// CHAOS-9077: the change tone follows the metric polarity, not the sign of the change.
const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const NEUTRAL = "text-(--ink-muted)";

const toneOf = (metric: string, delta_pct: number) => {
    const row: MetricDelta = {
        metric,
        label: `Label ${metric}`,
        value: 10,
        unit: "%",
        delta_pct,
        has_data: true,
        has_prior_data: true,
        rate_state: "measured",
        spark: [],
    };
    render(
        <EvidenceDrawerProvider>
            <QualityEvidenceTiles
                filters={filters}
                tiles={[{ metric, label: row.label, row, description: "d" }]}
            />
        </EvidenceDrawerProvider>,
    );
    return within(screen.getByTestId(`quality-tile-${metric}`)).getByTestId("metric-delta");
};

describe("Quality tile change tone follows polarity", () => {
    it.each(["change_failure_rate", "pr_rework_ratio"])("%s (lower is better)", (metric) => {
        const fall = toneOf(metric, -3);
        expect(fall).toHaveClass(GOOD);
        expect(fall).not.toHaveClass(BAD);
    });

    it.each(["change_failure_rate", "pr_rework_ratio"])("%s rising is bad", (metric) => {
        const rise = toneOf(metric, 3);
        expect(rise).toHaveClass(BAD);
        expect(rise).not.toHaveClass(GOOD);
    });

    it("ci_success (higher is better) rising is good", () => {
        expect(toneOf("ci_success", 3)).toHaveClass(GOOD);
    });

    it("ci_success (higher is better) falling is bad", () => {
        expect(toneOf("ci_success", -3)).toHaveClass(BAD);
    });

    it.each([-3, 3])("a metric with no polarity is neutral at %s", (d) => {
        const el = toneOf("some_unknown_metric", d);
        expect(el).toHaveClass(NEUTRAL);
        expect(el).not.toHaveClass(GOOD);
        expect(el).not.toHaveClass(BAD);
    });
});
