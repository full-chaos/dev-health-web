import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { MetricEvidenceCards } from "./MetricEvidenceCards";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";

const row = (metric: string, label: string) => ({
    metric,
    label,
    value: 2,
    unit: "days",
    delta_pct: 12,
    spark: [
        { ts: "2026-06-01", value: 1 },
        { ts: "2026-06-02", value: 2 },
    ],
});
const deltas = [row("cycle_time", "Cycle Time"), row("review_latency", "Review Latency")];
const filters = (repos: string[]) =>
    ({
        scope: { level: "org", ids: ["org-1"] },
        time: { range_days: 30, compare_days: 30 },
        who: {},
        what: repos.length ? { repos } : {},
        why: {},
        how: {},
    }) as never;

describe("MetricEvidenceCards repository note (CHAOS-9089)", () => {
    it("notes the unscoped tile only, and keeps its value and change", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time", "review_latency"]}
                deltas={deltas}
                filters={filters(["full-chaos/dev-health-web"])}
                placeholderDeltas={false}
            />,
        );
        expect(screen.getAllByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toHaveLength(1);
        expect(screen.getAllByText("+12%")).toHaveLength(2);
    });

    it("has no note without a repository", () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time", "review_latency"]}
                deltas={deltas}
                filters={filters([])}
                placeholderDeltas={false}
            />,
        );
        expect(screen.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });
});
