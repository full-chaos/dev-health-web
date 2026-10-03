import { beforeEach, describe, expect, it, vi } from "vitest";
const HOSTILE =
    "[GraphQL] capacityForecast is served by query-api and has no Python implementation. The Go dispatcher did not intercept this request (cmd/query-api/query_route.go)";

import { render, screen, within } from "@/test/utils";
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

describe("CapacityView — what the page shows (pins, updated for the page pass)", () => {
    it("shows remaining work and the three percentile dates as tiles, with the days and the Target tag", () => {
        render(<CapacityView filters={filters} />);

        const tile = (id: string) => within(screen.getByTestId(id));
        expect(tile("tile-remaining").getByText("Remaining work")).toBeInTheDocument();
        // The number and its unit apart: the unit is drawn small beside the number.
        expect(tile("tile-remaining").getByTestId("metric-value")).toHaveTextContent("42 items");
        expect(tile("tile-remaining").getByTestId("metric-unit")).toHaveTextContent("items");
        expect(tile("tile-p50").getByText("P50 · optimistic")).toBeInTheDocument();
        expect(tile("tile-p50").getByText("9 days")).toBeInTheDocument();
        expect(tile("tile-p85").getByText("P85 · target")).toBeInTheDocument();
        expect(tile("tile-p85").getByText("19 days")).toBeInTheDocument();
        expect(tile("tile-p85").getByText("Target")).toBeInTheDocument();
        expect(tile("tile-p95").getByText("P95 · conservative")).toBeInTheDocument();
        expect(tile("tile-p95").getByText("30 days")).toBeInTheDocument();
        // The old "50% chance" rows are gone.
        expect(screen.queryByText("50% chance")).toBeNull();
    });

    it("draws the tiles as one joined strip with a column per tile", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.getByTestId("forecast-tiles")).toHaveAttribute("data-columns", "4");
        expect(screen.getAllByTestId(/^tile-/)).toHaveLength(4);
    });

    it("lays the projection beside the Forecast inputs card, and keeps the distribution below", () => {
        render(<CapacityView filters={filters} />);

        for (const name of ["Completion projection", "Forecast inputs", "Interpretation"]) {
            expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
        }
        expect(
            screen.getByRole("heading", { name: "Throughput Distribution" }),
        ).toBeInTheDocument();
    });

    it("sends only the first team id and the filter's range as history days", () => {
        render(<CapacityView filters={filters} />);

        expect(hook.lastOptions).toEqual({
            orgId: "org-1",
            input: { teamId: "team-a", historyDays: 60 },
        });
    });

    it("says 1 day, not 1 days, in a tile caption", () => {
        hook.state.data = forecast({ p50Days: 1, p85Days: 2, p95Days: 3 });
        render(<CapacityView filters={filters} />);

        expect(within(screen.getByTestId("tile-p50")).getByText("1 day")).toBeInTheDocument();
        expect(within(screen.getByTestId("tile-p85")).getByText("2 days")).toBeInTheDocument();
    });

    it("shows the forecast inputs: mean and standard deviation per day, history, remaining items", () => {
        render(<CapacityView filters={filters} />);

        const inputs = within(screen.getByTestId("forecast-inputs"));
        expect(inputs.getByText("Forecast inputs")).toBeInTheDocument();
        expect(inputs.getByText("3.3 items/day")).toBeInTheDocument();
        expect(inputs.getByText("1.1 items/day")).toBeInTheDocument();
        expect(inputs.getByText("90 days")).toBeInTheDocument();
        expect(inputs.getByText("42")).toBeInTheDocument();
        expect(screen.getByText("Based on 90 days of historical data")).toBeInTheDocument();
    });

    it("shows the two warnings in one warning notice when history is short or variance is high", () => {
        hook.state.data = forecast({ insufficientHistory: true, highVariance: true });
        render(<CapacityView filters={filters} />);

        expect(screen.getByTestId("forecast-warnings")).toHaveAttribute(
            "data-notice-variant",
            "warn",
        );
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
        expect(screen.getByText("Completion projection")).toBeInTheDocument();
        expect(screen.getByText("Monte Carlo forecast for work completion")).toBeInTheDocument();
        expect(screen.getByText("Throughput Distribution")).toBeInTheDocument();
        expect(
            screen.getByText(
                /Line = backlog burned at the mean throughput; markers = the forecast's P50 \/ P85 \/ P95 days\. No distribution is drawn\./,
            ),
        ).toBeInTheDocument();
    });

    it("shows the Interpretation section with the three percentile texts", () => {
        render(<CapacityView filters={filters} />);

        const interp = within(screen.getByTestId("forecast-interpretation"));
        expect(interp.getByRole("heading", { name: "Interpretation" })).toBeInTheDocument();
        expect(screen.queryByText("How to Interpret")).toBeNull();
        // Three inset cards, one per percentile.
        expect(interp.getAllByRole("heading", { level: 4 })).toHaveLength(3);
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

    it("has no inner heading row: the page title is the only Completion Forecast heading", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.queryByRole("heading", { name: "Completion Forecast" })).toBeNull();
        expect(screen.queryByRole("button", { name: /Refresh Forecast|Computing/ })).toBeNull();
    });

    it("shows skeleton tiles while loading", () => {
        hook.state = { ...hook.state, loading: true };
        render(<CapacityView filters={filters} />);

        expect(screen.getByTestId("forecast-loading")).toBeInTheDocument();
        expect(screen.queryByTestId("forecast-tiles")).toBeNull();
    });

    it("shows the error title and the plain sentence, and the empty text", () => {
        hook.state = { ...hook.state, data: null, error: new Error(HOSTILE) };
        const first = render(<CapacityView filters={filters} />);
        expect(screen.getByText("Forecast unavailable")).toBeInTheDocument();
        expect(screen.queryByText(HOSTILE)).toBeNull();
        expect(screen.getByText("Could not be read")).toBeInTheDocument();
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

    it("shows the low-variance range as one tile, not three percentiles", () => {
        hook.state.data = forecast({
            p50Date: "2026-06-15",
            p85Date: "2026-06-15",
            p95Date: "2026-06-15",
            p50Days: 14,
            p85Days: 14,
            p95Days: 14,
        });
        render(<CapacityView filters={filters} />);

        const range = within(screen.getByTestId("tile-range"));
        expect(range.getByText("Forecast range")).toBeInTheDocument();
        expect(range.getByText("≈2 weeks")).toBeInTheDocument();
        expect(range.getByText(/low variance · Jun 1[45]/)).toBeInTheDocument();
        expect(screen.queryByTestId("tile-p50")).toBeNull();
        expect(screen.queryByTestId("tile-p95")).toBeNull();
    });
});
