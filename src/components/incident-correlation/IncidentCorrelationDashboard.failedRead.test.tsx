/**
 * The DORA tiles of the incident-correlation dashboard, a FAILED Home read against an EMPTY answer
 * (CHAOS-9189 in the describe name). The real MetricCard is used: the test reads the drawn text.
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

const filters: MetricFilter = {
    scope: { level: "repo", ids: ["my-repo"] },
    time: { range_days: 30, compare_days: 0, start_date: undefined, end_date: undefined },
    who: {},
    what: {},
    why: {},
    how: {},
};

const base = {
    orgId: "org-test",
    drivers: [],
    contributors: [],
    deploysEdges: [] as WorkGraphEdge[],
    incidentEdges: [] as WorkGraphEdge[],
    filters,
};

const cfr = {
    metric: "change_failure_rate",
    label: "Change Failure Rate",
    value: 7,
    unit: "%",
    delta_pct: 2,
    has_data: true,
    has_prior_data: true,
    spark: [],
};

describe("IncidentCorrelationDashboard DORA tiles when the Home read fails (CHAOS-9189)", () => {
    it("failed read: three DORA tiles say 'Could not be read', and no empty-state panel is drawn", () => {
        renderWithEvidenceDrawer(
            <IncidentCorrelationDashboard {...base} deltas={[]} homeReadFailed />,
        );

        const section = screen.getByTestId("dora-read-failed");
        const values = within(section).getAllByTestId("metric-value");
        expect(values).toHaveLength(3);
        for (const value of values) {
            expect(value).toHaveTextContent(/^Could not be read$/);
        }
        expect(within(section).getByText("Change Failure Rate")).toBeInTheDocument();
        expect(section.textContent).not.toMatch(/Not reported|No data for this window/);
        expect(screen.queryByTestId("empty-state")).toBeNull();
        expect(screen.queryByText("No incident-correlation evidence in this window.")).toBeNull();
    });

    it("empty answer: the empty-state panel is drawn and nothing says 'Could not be read'", () => {
        renderWithEvidenceDrawer(
            <IncidentCorrelationDashboard {...base} deltas={[]} homeReadFailed={false} />,
        );

        expect(screen.getByTestId("empty-state")).toHaveTextContent(
            "No incident-correlation evidence in this window.",
        );
        expect(screen.queryByTestId("dora-read-failed")).toBeNull();
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: the served DORA value is drawn and nothing says 'Could not be read'", () => {
        renderWithEvidenceDrawer(
            <IncidentCorrelationDashboard
                {...base}
                deltas={[cfr] as never}
                homeReadFailed={false}
            />,
        );

        const section = screen.getByRole("region", { name: "DORA metrics" });
        expect(within(section).getByTestId("metric-value")).toHaveTextContent(/^7\s*%$/);
        expect(screen.queryByTestId("dora-read-failed")).toBeNull();
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});
