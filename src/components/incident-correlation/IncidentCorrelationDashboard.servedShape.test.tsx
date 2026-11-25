/** Served-shape check: the DORA tiles must draw the metric keys that Home serves (deploy_freq, change_failure_rate). */
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

const filters: MetricFilter = {
    scope: { level: "repo", ids: ["repo-a"] },
    time: { range_days: 30, compare_days: 0, start_date: undefined, end_date: undefined },
    who: {},
    what: {},
    why: {},
    how: {},
};

const delta = (metric: string, label: string, unit: string, value: number) =>
    ({
        metric,
        label,
        value,
        unit,
        delta_pct: 0,
        spark: [],
        has_data: true,
        has_prior_data: true,
    }) as never;

const renderDora = (deltas: unknown[]) =>
    renderWithEvidenceDrawer(
        <IncidentCorrelationDashboard
            orgId="org-test"
            drivers={[]}
            contributors={[]}
            deploysEdges={[] as WorkGraphEdge[]}
            incidentEdges={[] as WorkGraphEdge[]}
            filters={filters}
            deltas={deltas as never}
        />,
    );

describe("incident-correlation DORA tiles read the served Home metric keys", () => {
    it("draws a tile for the served deploy_freq metric", () => {
        renderDora([
            delta("deploy_freq", "Deploy Frequency", "deploys", 3),
            delta("change_failure_rate", "Change Failure Rate", "%", 12),
        ]);
        const section = screen.getByRole("region", { name: "DORA metrics" });
        expect(within(section).getByText("Deploy Frequency")).toBeInTheDocument();
    });

    it("control: the served change_failure_rate metric draws its tile", () => {
        renderDora([delta("change_failure_rate", "Change Failure Rate", "%", 12)]);
        const section = screen.getByRole("region", { name: "DORA metrics" });
        expect(within(section).getByText("Change Failure Rate")).toBeInTheDocument();
    });

    it("control: no served DORA metric keeps the section absent", () => {
        renderDora([]);
        expect(screen.queryByRole("region", { name: "DORA metrics" })).toBeNull();
    });
});
