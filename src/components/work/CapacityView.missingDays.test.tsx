import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

/**
 * The four states of the "Completion range" card stay apart (CHAOS-8005, CHAOS-8477): served,
 * not served, empty, failed. A value the API did not serve is never zero and never a made-up
 * point: a missing distribution reads "Not reported", and a missing day percentile leaves its
 * marker out of a curve that is still drawn from the served points.
 */
const hook = vi.hoisted(() => ({
    state: {
        data: null as CapacityForecast | null,
        loading: false,
        error: null as Error | null,
        refetch: vi.fn(),
    },
}));
const range = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/graphql/hooks", () => ({ useCapacityForecast: () => hook.state }));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("@/components/charts/CompletionRangeChart", () => ({
    CompletionRangeChart: (props: Record<string, unknown>) => {
        range.props.push(props);
        return <div data-testid="range-chart" />;
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
    completionDistribution: {
        runs: 100,
        unfinishedRuns: 0,
        horizonDays: 365,
        days: [
            { value: 9, count: 55, cumulativeShare: 0.55 },
            { value: 19, count: 35, cumulativeShare: 0.9 },
            { value: 30, count: 10, cumulativeShare: 1 },
        ],
        items: null,
    },
    ...over,
});

const show = (data: CapacityForecast | null, error: Error | null = null) => {
    hook.state = { data, loading: false, error, refetch: vi.fn() };
    return render(<CapacityView filters={defaultMetricFilter} />);
};

const card = () => within(screen.getByTestId("completion-range-card"));
const markerDays = () =>
    (range.props.at(-1)!.markers as Array<{ day: number }>).map((marker) => marker.day);

beforeEach(() => {
    range.props = [];
});

describe("CapacityView — the states of the Completion range card", () => {
    it("draws the curve from the served points, with the three served percentile days", () => {
        show(forecast());

        expect(card().getByTestId("range-chart")).toBeInTheDocument();
        expect(range.props.at(-1)!.points).toEqual([
            { day: 9, share: 0.55 },
            { day: 19, share: 0.9 },
            { day: 30, share: 1 },
        ]);
        expect(markerDays()).toEqual([9, 19, 30]);
        expect(card().getByTestId("completion-range")).not.toHaveAttribute("data-reported");
    });

    it("draws no chart and says Not reported when the distribution is not served", () => {
        show(forecast({ completionDistribution: NOT_SERVED }));

        // No chart at all: a curve with no served point would be made in the web.
        expect(screen.queryByTestId("range-chart")).toBeNull();
        expect(range.props).toEqual([]);
        const state = card().getByTestId("completion-range");
        expect(state).toHaveAttribute("data-reported", "false");
        expect(state).toHaveTextContent(/^Not reported/u);
        // Not the empty state and not the failed state.
        expect(card().queryByText("No data for this window")).toBeNull();
        expect(card().queryByText("Could not be read")).toBeNull();
    });

    it.each([
        ["P50", { p50Days: NOT_SERVED }, [19, 30]],
        ["P85", { p85Days: NOT_SERVED }, [9, 30]],
        ["P95", { p95Days: NOT_SERVED }, [9, 19]],
        ["P50 (absent key)", { p50Days: undefined }, [19, 30]],
    ] as const)(
        "leaves out the %s marker when only that day percentile is not served; no zero-day marker",
        (_name, over, days) => {
            show(forecast(over));

            // The curve does not need the percentiles: it is still the served points.
            expect(card().getByTestId("range-chart")).toBeInTheDocument();
            expect(markerDays()).toEqual(days);
            expect(markerDays()).not.toContain(0);
        },
    );

    it("draws no marker and no planning range when no day percentile is served", () => {
        show(forecast({ p50Days: NOT_SERVED, p85Days: NOT_SERVED, p95Days: NOT_SERVED }));

        expect(card().getByTestId("range-chart")).toBeInTheDocument();
        expect(markerDays()).toEqual([]);
        expect(range.props.at(-1)!.planningRange).toBeNull();
    });

    it("draws a served zero: 0 days is a value, not a missing one", () => {
        show(forecast({ p50Days: 0, p85Days: 0, p95Days: 0 }));

        expect(markerDays()).toEqual([0, 0, 0]);
    });

    it("keeps the empty and the failed card apart from Not reported", () => {
        const empty = show(null);
        expect(card().getByText("No data for this window")).toBeInTheDocument();
        expect(screen.queryByTestId("completion-range")).toBeNull();
        expect(card().queryByText("Could not be read")).toBeNull();
        empty.unmount();

        show(null, new Error("backend text that is never shown"));
        expect(card().getByText("Could not be read")).toBeInTheDocument();
        expect(screen.queryByTestId("completion-range")).toBeNull();
        expect(card().queryByText("No data for this window")).toBeNull();
    });
});
