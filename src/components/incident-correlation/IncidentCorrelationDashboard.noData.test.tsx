/**
 * The DORA tiles of the incident-correlation page with the REAL MetricCard (the main test file
 * mocks it): the served no-data flags decide what a tile draws (CHAOS-9042).
 */
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

function makeFilter(): MetricFilter {
    return {
        scope: { level: "repo", ids: ["my-repo"] },
        time: {
            range_days: 30,
            compare_days: 0,
            start_date: undefined,
            end_date: undefined,
        },
        who: {},
        what: {},
        why: {},
        how: {},
    };
}

describe("IncidentCorrelationDashboard DORA tiles: served no-data flags (CHAOS-9042)", () => {
    const base = {
        orgId: "org-test",
        drivers: [],
        contributors: [],
        deploysEdges: [] as WorkGraphEdge[],
        incidentEdges: [] as WorkGraphEdge[],
        filters: makeFilter(),
    };
    const cfr = (extra: Record<string, unknown>) => ({
        metric: "change_failure_rate",
        label: "Change Failure Rate",
        value: 0,
        unit: "%",
        delta_pct: 0,
        spark: [],
        ...extra,
    });
    const renderTile = (extra: Record<string, unknown>) => {
        renderWithEvidenceDrawer(
            <IncidentCorrelationDashboard {...base} deltas={[cfr(extra)] as never} />,
        );
        return screen.getByRole("region", { name: "DORA metrics" });
    };

    it("has_data false: 'No data for this window', no 0, no change", () => {
        const section = renderTile({ has_data: false });
        expect(within(section).getByTestId("metric-value")).toHaveTextContent(
            /^No data for this window$/,
        );
        expect(section.textContent).not.toMatch(/0/);
        expect(within(section).queryByTestId("metric-delta")).toBeNull();
    });

    it("has_prior_data false: the value and 'No prior period', never '0%' or 'No change'", () => {
        const section = renderTile({ has_prior_data: false, value: 5 });
        expect(within(section).getByTestId("metric-value")).toHaveTextContent("5");
        expect(within(section).getByText("No prior period")).toBeInTheDocument();
        expect(within(section).queryByTestId("metric-delta")).toBeNull();
        expect(section.textContent).not.toMatch(/0%/);
        expect(section.textContent).not.toMatch(/No change/);
    });

    it("a measured 0 with data in both windows is still drawn as 0", () => {
        const section = renderTile({ has_data: true, has_prior_data: true });
        expect(within(section).getByTestId("metric-value")).toHaveTextContent(/^0\s*%$/);
        expect(within(section).getByTestId("metric-delta")).toBeInTheDocument();
    });
});
