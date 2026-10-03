import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

/**
 * CHAOS-8005: a day percentile the API did not serve is not zero. The projection card draws the
 * burn chart only from three served day percentiles; with one missing it says "Not reported" and
 * draws nothing. The four states of the card stay apart: served, not served, empty, failed.
 */
const hook = vi.hoisted(() => ({
    state: {
        data: null as CapacityForecast | null,
        loading: false,
        error: null as Error | null,
        refetch: vi.fn(),
    },
}));
const band = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/graphql/hooks", () => ({ useCapacityForecast: () => hook.state }));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("@/components/charts/ConfidenceBandChart", () => ({
    ConfidenceBandChart: (props: Record<string, unknown>) => {
        band.props.push(props);
        return <div data-testid="band-chart" />;
    },
}));
// Every other chart of the page goes through the shared wrapper and the chart theme: no canvas
// and no theme subscription (jsdom has no matchMedia) in a unit test.
vi.mock("@/components/charts/Chart", () => ({ Chart: () => <div data-testid="other-chart" /> }));
vi.mock("@/components/charts/chartTheme", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/charts/chartTheme")>()),
    useChartTheme: () => ({}),
    useChartColors: () => [],
}));

import { CapacityView } from "./CapacityView";

/** GraphQL sends `null` for a nullable field it has no value for. */
const NOT_SERVED = null as unknown as undefined;

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

const show = (data: CapacityForecast | null, error: Error | null = null) => {
    hook.state = { data, loading: false, error, refetch: vi.fn() };
    return render(<CapacityView filters={defaultMetricFilter} />);
};

const projection = () =>
    within(
        screen
            .getByRole("heading", { level: 2, name: "Completion projection" })
            .closest("section")!,
    );

beforeEach(() => {
    band.props = [];
});

describe("CapacityView — the projection card when a day percentile is not served", () => {
    it("draws the burn chart from the three served day percentiles", () => {
        show(forecast());

        expect(screen.getByTestId("band-chart")).toBeInTheDocument();
        expect(band.props.at(-1)).toMatchObject({ p50Days: 9, p85Days: 19, p95Days: 30 });
        expect(screen.queryByTestId("forecast-chart-not-reported")).toBeNull();
    });

    it("draws no chart and says Not reported when the three day percentiles are not served", () => {
        show(
            forecast({
                p50Days: NOT_SERVED,
                p85Days: NOT_SERVED,
                p95Days: NOT_SERVED,
                p50Date: NOT_SERVED,
                p85Date: NOT_SERVED,
                p95Date: NOT_SERVED,
            }),
        );

        // No chart at all: a zero-day line would be a number the web made.
        expect(screen.queryByTestId("band-chart")).toBeNull();
        expect(band.props).toEqual([]);
        const card = within(screen.getByTestId("forecast-chart-not-reported"));
        expect(card.getByText("Not reported")).toBeInTheDocument();
        // The caption explains a line that is not there: it goes with the chart.
        expect(screen.queryByText(/Line = backlog burned at the mean throughput/)).toBeNull();
        // Not the empty state and not the failed state.
        expect(projection().queryByText("No data for this window")).toBeNull();
        expect(projection().queryByText("Could not be read")).toBeNull();
    });

    it.each([
        ["P50", { p50Days: NOT_SERVED }],
        ["P85", { p85Days: NOT_SERVED }],
        ["P95", { p95Days: NOT_SERVED }],
        ["P50 (absent key)", { p50Days: undefined }],
    ] as const)("draws no chart when only %s is not served", (_name, over) => {
        show(forecast(over));

        expect(screen.queryByTestId("band-chart")).toBeNull();
        expect(band.props).toEqual([]);
        expect(screen.getByTestId("forecast-chart-not-reported")).toBeInTheDocument();
    });

    it("draws a served zero: 0 days is a value, not a missing one", () => {
        show(forecast({ p50Days: 0, p85Days: 0, p95Days: 0 }));

        expect(screen.getByTestId("band-chart")).toBeInTheDocument();
        expect(band.props.at(-1)).toMatchObject({ p50Days: 0, p85Days: 0, p95Days: 0 });
        expect(screen.queryByTestId("forecast-chart-not-reported")).toBeNull();
    });

    it("keeps the empty and the failed card apart from Not reported", () => {
        const empty = show(null);
        expect(projection().getByText("No data for this window")).toBeInTheDocument();
        expect(screen.queryByTestId("forecast-chart-not-reported")).toBeNull();
        expect(projection().queryByText("Could not be read")).toBeNull();
        empty.unmount();

        show(null, new Error("backend text that is never shown"));
        expect(projection().getByText("Could not be read")).toBeInTheDocument();
        expect(screen.queryByTestId("forecast-chart-not-reported")).toBeNull();
        expect(projection().queryByText("No data for this window")).toBeNull();
    });
});
