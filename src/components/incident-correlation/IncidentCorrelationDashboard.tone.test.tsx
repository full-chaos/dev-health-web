/** CHAOS-9077: the DORA tile change tone follows the metric polarity, not the sign. */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { IncidentCorrelationDashboard, type WorkGraphEdge } from "./IncidentCorrelationDashboard";
import type { MetricFilter } from "@/lib/filters/types";

vi.mock("@/components/charts/SankeyChart", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/charts/SankeyChart")>()),
    SankeyChart: () => <div data-testid="sankey-chart" />,
}));
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({ muted: "#777777", text: "#111111" }),
    useChartTokens: () => ({ caution: "#c98500", accentHighlight: "#e8650a" }),
    useChartColors: () => ["#1", "#2", "#3"],
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="horizontal-bar-chart" />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/incident-correlation",
    useRouter: () => ({ refresh: vi.fn() }),
}));

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const NEUTRAL = "text-(--ink-muted)";

const filters: MetricFilter = {
    scope: { level: "repo", ids: ["my-repo"] },
    time: { range_days: 30, compare_days: 0, start_date: undefined, end_date: undefined },
    who: {},
    what: {},
    why: {},
    how: {},
};

const toneOf = (metric: string, delta_pct: number) => {
    renderWithEvidenceDrawer(
        <IncidentCorrelationDashboard
            orgId="org-test"
            drivers={[]}
            contributors={[]}
            deploysEdges={[] as WorkGraphEdge[]}
            incidentEdges={[] as WorkGraphEdge[]}
            filters={filters}
            deltas={
                [
                    {
                        metric,
                        label: `Label ${metric}`,
                        value: 10,
                        unit: "%",
                        delta_pct,
                        spark: [],
                        has_data: true,
                        has_prior_data: true,
                    },
                ] as never
            }
        />,
    );
    const section = screen.getByRole("region", { name: "DORA metrics" });
    return within(section).getByTestId("metric-delta");
};

describe("DORA tile change tone follows polarity", () => {
    it("change_failure_rate (lower is better) falling is good", () => {
        const el = toneOf("change_failure_rate", -3);
        expect(el).toHaveClass(GOOD);
        expect(el).not.toHaveClass(BAD);
    });

    it("change_failure_rate (lower is better) rising is bad", () => {
        const el = toneOf("change_failure_rate", 3);
        expect(el).toHaveClass(BAD);
        expect(el).not.toHaveClass(GOOD);
    });

    // The page draws only its DORA keys; these two have no catalog polarity.
    it.each([
        ["deployment_frequency", -3],
        ["deployment_frequency", 3],
        ["mttr", -3],
        ["mttr", 3],
    ])("%s (no catalog polarity) is neutral at %s", (metric, d) => {
        const el = toneOf(metric as string, d as number);
        expect(el).toHaveClass(NEUTRAL);
        expect(el).not.toHaveClass(GOOD);
        expect(el).not.toHaveClass(BAD);
    });
});
