/** CHAOS-14647: the Deploy Frequency tile reads the served Home key `deploy_freq`. */
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
    scope: { level: "repo", ids: ["my-repo"] },
    time: { range_days: 30, compare_days: 0, start_date: undefined, end_date: undefined },
    who: {},
    what: {},
    why: {},
    how: {},
};

const served = (metric: string, label: string, unit: string, value: number) => ({
    metric,
    label,
    value,
    unit,
    delta_pct: 5,
    spark: [],
    has_data: true,
    has_prior_data: true,
});

const renderTiles = (deltas: unknown[]) => {
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
    return within(screen.getByRole("region", { name: "DORA metrics" }));
};

describe("DORA tiles read the served Home keys (CHAOS-14647)", () => {
    it("draws the Deploy Frequency tile from the served deploy_freq key", () => {
        const dora = renderTiles([
            served("change_failure_rate", "Change Failure Rate", "%", 4),
            served("deploy_freq", "Deploy Frequency", "deploys", 42),
        ]);
        expect(dora.getByText("Deploy Frequency")).toBeInTheDocument();
        expect(dora.getByText("42")).toBeInTheDocument();
    });

    it("draws the change failure rate tile from the served change_failure_rate key", () => {
        const dora = renderTiles([served("change_failure_rate", "Change Failure Rate", "%", 4)]);
        expect(dora.getByText("Change Failure Rate")).toBeInTheDocument();
        expect(dora.queryByText("Deploy Frequency")).not.toBeInTheDocument();
    });

    it("draws no tile for keys the Home read does not serve", () => {
        const dora = renderTiles([
            served("change_failure_rate", "Change Failure Rate", "%", 4),
            served("deployment_frequency", "Deployment Frequency", "deploys", 9),
            served("mttr", "MTTR", "hours", 3),
        ]);
        expect(dora.getByText("Change Failure Rate")).toBeInTheDocument();
        expect(dora.queryByText("Deployment Frequency")).not.toBeInTheDocument();
        expect(dora.queryByText("MTTR")).not.toBeInTheDocument();
    });
});
