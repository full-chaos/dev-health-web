import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";
import type { MetricFilter } from "@/lib/filters/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

const hook = vi.hoisted(() => ({
    state: {
        data: null as CapacityForecast | null,
        loading: false,
        error: null as Error | null,
        refetch: vi.fn(),
    },
    lastOptions: undefined as unknown,
}));

vi.mock("@/lib/graphql/hooks", () => ({
    useCapacityForecast: (options: unknown) => {
        hook.lastOptions = options;
        return hook.state;
    },
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("@/components/charts/ConfidenceBandChart", () => ({
    ConfidenceBandChart: () => <div data-testid="band-chart" />,
}));
vi.mock("@/components/charts/ThroughputHistogram", () => ({
    ThroughputHistogram: () => <div data-testid="histogram" />,
}));

import { CapacityView } from "./CapacityView";

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    p50Date: "2026-06-10",
    p85Date: "2026-06-20",
    p95Date: "2026-07-01",
    p50Days: 9,
    p85Days: 19,
    p95Days: 30,
    throughputMean: 3.25,
    throughputStddev: 1.1,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
    ...over,
});

const filters: MetricFilter = {
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-a", "team-b"] },
    time: { ...defaultMetricFilter.time, range_days: 60 },
};

beforeEach(() => {
    hook.state = { data: forecast(), loading: false, error: null, refetch: vi.fn() };
});

describe("CapacityView — what the page shows today (pins)", () => {
    it("shows the forecast card: scope, backlog, 50 / 85 / 95 % dates with days, Target tag", () => {
        hook.state.data = forecast({ teamId: "team-a" });
        render(<CapacityView filters={filters} />);

        expect(screen.getByText("Team: team-a")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
        expect(screen.getByText("50% chance")).toBeInTheDocument();
        expect(screen.getByText("85% chance")).toBeInTheDocument();
        expect(screen.getByText("95% chance")).toBeInTheDocument();
        expect(screen.getByText("(9 days)")).toBeInTheDocument();
        expect(screen.getByText("(19 days)")).toBeInTheDocument();
        expect(screen.getByText("(30 days)")).toBeInTheDocument();
        expect(screen.getByText("Target")).toBeInTheDocument();
    });

    it("sends only the first team id and the filter's range as history days", () => {
        render(<CapacityView filters={filters} />);

        expect(hook.lastOptions).toEqual({
            orgId: "org-1",
            input: { teamId: "team-a", historyDays: 60 },
        });
    });

    it("shows throughput as mean ± standard deviation per day, and the history", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.getByText(/3\.3 ±/)).toBeInTheDocument();
        expect(screen.getByText(/1\.1/)).toBeInTheDocument();
        expect(screen.getByText("90 days")).toBeInTheDocument();
        expect(screen.getByText("Based on 90 days of historical data")).toBeInTheDocument();
    });

    it("shows the two warnings when history is short or variance is high", () => {
        hook.state.data = forecast({ insufficientHistory: true, highVariance: true });
        render(<CapacityView filters={filters} />);

        expect(
            screen.getByText("Limited history available. Forecast may be less reliable."),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "High throughput variance detected. Consider using more history days.",
            ),
        ).toBeInTheDocument();
    });

    it("keeps the projection chart caption and the two section titles", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.getByTestId("band-chart")).toBeInTheDocument();
        expect(screen.getByTestId("histogram")).toBeInTheDocument();
        expect(screen.getByText("Completion Projection")).toBeInTheDocument();
        expect(screen.getByText("Throughput Distribution")).toBeInTheDocument();
        expect(
            screen.getByText(
                /Line = backlog burned at the mean throughput; markers = the forecast's P50 \/ P85 \/ P95 days\. No distribution is drawn\./,
            ),
        ).toBeInTheDocument();
    });

    it("keeps the How to Interpret texts", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.getByText("How to Interpret")).toBeInTheDocument();
        expect(
            screen.getByText("Optimistic estimate. Half of simulations complete by this date."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Recommended target. 85% confidence provides buffer for variability."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Conservative estimate. Use for commitments with low risk tolerance."),
        ).toBeInTheDocument();
    });

    it("refreshes through the Refresh Forecast button", async () => {
        render(<CapacityView filters={filters} />);

        await userEvent.click(screen.getByRole("button", { name: "Refresh Forecast" }));

        expect(hook.state.refetch).toHaveBeenCalledTimes(1);
    });

    it("shows Computing... and a disabled button while loading", () => {
        hook.state = { ...hook.state, loading: true };
        render(<CapacityView filters={filters} />);

        expect(screen.getByRole("button", { name: "Computing..." })).toBeDisabled();
    });

    it("shows the error title and message, and the empty text", () => {
        hook.state = { ...hook.state, data: null, error: new Error("boom") };
        const first = render(<CapacityView filters={filters} />);
        expect(screen.getByText("Forecast Unavailable")).toBeInTheDocument();
        expect(screen.getByText("boom")).toBeInTheDocument();
        first.unmount();

        hook.state = { ...hook.state, data: null, error: null };
        render(<CapacityView filters={filters} />);
        expect(screen.getByText("No Forecast Available")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Insufficient throughput history to generate a forecast. Need at least 14 days of data.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText("No forecast data available")).toBeInTheDocument();
    });

    it("shows the low-variance range as one row, not three percentiles", () => {
        hook.state.data = forecast({
            p50Date: "2026-06-15",
            p85Date: "2026-06-15",
            p95Date: "2026-06-15",
            p50Days: 14,
            p85Days: 14,
            p95Days: 14,
        });
        render(<CapacityView filters={filters} />);

        expect(screen.getByText("≈2 weeks (low variance)")).toBeInTheDocument();
        expect(screen.queryByText("50% chance")).toBeNull();
    });
});
