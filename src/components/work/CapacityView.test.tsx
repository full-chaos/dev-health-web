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
vi.mock("@/components/charts/CompletionRangeChart", () => ({
    CompletionRangeChart: () => <div data-testid="range-chart" />,
}));

import { CapacityView } from "./CapacityView";

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    // The count the simulation ran on. It differs from the backlog on purpose.
    targetItems: 40,
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

    it("lays the projection beside the Forecast inputs card, then the simulated outcomes, with the Interpretation below", () => {
        render(<CapacityView filters={filters} />);

        // No other section: these three, in this order, are all the page draws under the tiles.
        expect(
            screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
        ).toEqual(["Completion range", "Forecast inputs", "Interpretation"]);
    });

    it("sends every selected team id and the filter's range as history days", () => {
        render(<CapacityView filters={filters} />);

        expect(hook.lastOptions).toEqual({
            orgId: "org-1",
            input: { teamIds: ["team-a", "team-b"], historyDays: 60 },
        });
    });

    it("labels the scope with the team count when several teams are selected and the response has no teamId", () => {
        hook.state.data = forecast({ teamId: null });
        render(<CapacityView filters={filters} />);

        const inputs = within(screen.getByTestId("forecast-inputs"));
        expect(inputs.getByText("2 teams")).toBeInTheDocument();
        expect(inputs.queryByText("All Teams")).toBeNull();
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

    // CHAOS-8477: the prototype's "Completion range" card takes the place of the burn-down chart.
    // The curve comes from the API's completionDistribution and nothing else.
    const distribution = {
        runs: 100,
        unfinishedRuns: 0,
        horizonDays: 365,
        days: [
            { value: 9, count: 40, cumulativeShare: 0.4 },
            { value: 10, count: 60, cumulativeShare: 1 },
        ],
        items: null,
    };

    it("draws the Completion range card with the Monte Carlo words when the forecast has a distribution", () => {
        hook.state = { ...hook.state, data: forecast({ completionDistribution: distribution }) };
        render(<CapacityView filters={filters} />);

        const card = within(screen.getByTestId("completion-range-card"));
        expect(
            card.getByRole("heading", { level: 2, name: "Completion range" }),
        ).toBeInTheDocument();
        expect(
            card.getByText(
                "Monte Carlo forecast: the chance that the remaining work is done by each day.",
            ),
        ).toBeInTheDocument();
        expect(card.getByTestId("range-chart")).toBeInTheDocument();
        expect(card.getByTestId("completion-range-note")).toHaveTextContent(
            "Monte Carlo forecast: each step is the share of the 100 simulation runs in which all 40 items were done by that day.",
        );
        expect(
            card.getByText(
                "Use the target and conservative dates as different planning choices, not as one promise.",
            ),
        ).toBeInTheDocument();
    });

    it("draws no burn-down chart and no histogram card", () => {
        hook.state = { ...hook.state, data: forecast({ completionDistribution: distribution }) };
        render(<CapacityView filters={filters} />);

        expect(screen.queryByText("Completion projection")).toBeNull();
        expect(screen.queryByText(/backlog burned at the mean throughput/)).toBeNull();
        expect(screen.queryByText("Simulated outcomes")).toBeNull();
        expect(screen.queryByTestId("completion-spread-card")).toBeNull();
        expect(screen.getAllByTestId("range-chart")).toHaveLength(1);
    });

    it("reads Not reported, and draws no chart, when the forecast has no stored distribution", () => {
        render(<CapacityView filters={filters} />);

        const card = within(screen.getByTestId("completion-range-card"));
        expect(card.getByTestId("completion-range")).toHaveAttribute("data-reported", "false");
        expect(card.getByTestId("completion-range")).toHaveTextContent(/^Not reported/);
        expect(card.queryByTestId("range-chart")).toBeNull();
        // The served tiles stay: the percentile dates do not need the distribution.
        expect(within(screen.getByTestId("tile-p50")).getByText("9 days")).toBeInTheDocument();
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
        // The notice and the projection card both say it: a failed read is never drawn as an empty one.
        expect(screen.getAllByText("Could not be read")).toHaveLength(2);
        expect(screen.getByTestId("forecast-chart-failed")).toBeInTheDocument();
        expect(screen.queryByText("No data for this window")).toBeNull();
        expect(screen.queryByText("No Forecast Available")).toBeNull();
        first.unmount();

        hook.state = { ...hook.state, data: null, error: null };
        render(<CapacityView filters={filters} />);
        expect(screen.getByText("No Forecast Available")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Insufficient throughput history to generate a forecast. Need at least 14 days of data.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText("No data for this window")).toBeInTheDocument();
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

    // CHAOS-7990: the API serves the mean and the standard deviation of the throughput, not the
    // daily counts. A distribution drawn from those two numbers is a curve the web makes.
    it("draws no throughput distribution; the served mean, deviation and history stay as facts", () => {
        render(<CapacityView filters={filters} />);

        expect(screen.queryByText("Throughput Distribution")).toBeNull();
        expect(screen.queryByTestId("chart-throughput-histogram")).toBeNull();
        expect(screen.queryByText(/days of historical data/)).toBeNull();

        const inputs = within(screen.getByTestId("forecast-inputs"));
        expect(inputs.getByText("3.3 items/day")).toBeInTheDocument();
        expect(inputs.getByText("1.1 items/day")).toBeInTheDocument();
        expect(inputs.getByText("90 days")).toBeInTheDocument();
    });
});
