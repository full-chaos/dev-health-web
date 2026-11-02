import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

// CHAOS-12622: a pin of everything the "Completion range" card draws, for a set of served
// forecasts. It holds the whole chart option (each formatter is called on the days and shares it
// draws) and the card's own markup. It was written against the card BEFORE its mapping moved to
// one shared function, and the move did not update it: the page renders the same.

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({
        text: "#111111",
        grid: "#222222",
        muted: "#333333",
        background: "#ffffff",
        stroke: "#444444",
        accent1: "#aa0001",
        accent2: "#aa0002",
        accent3: "#aa0003",
    }),
    useChartColors: () => ["#0b8fb0", "#c98500"],
}));
vi.mock("@/components/charts/Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

import { CompletionRange } from "./CompletionRange";

type Distribution = NonNullable<CapacityForecast["completionDistribution"]>;
type Bin = Distribution["days"][number];

const forecast = (
    over: Partial<CapacityForecast> = {},
    distribution: Partial<Distribution> | null = {},
): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T08:30:00Z",
    backlogSize: 55,
    targetItems: 40,
    p50Date: "2026-06-20",
    p85Date: "2026-06-25",
    p95Date: "2026-06-28",
    p50Days: 19,
    p85Days: 24,
    p95Days: 27,
    throughputMean: 3.25,
    throughputStddev: 1.1,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
    completionDistribution:
        distribution === null
            ? null
            : {
                  runs: 200,
                  unfinishedRuns: 0,
                  horizonDays: 365,
                  days: [
                      { value: 18, count: 50, cumulativeShare: 0.25 },
                      { value: 19, count: 120, cumulativeShare: 0.85 },
                      { value: 27, count: 30, cumulativeShare: 1 },
                  ],
                  items: null,
                  ...distribution,
              },
    ...over,
});

const bins = (rows: Array<[number, number, number]>): Bin[] =>
    rows.map(([value, count, cumulativeShare]) => ({ value, count, cumulativeShare }));

/** Each served forecast shape the card has a rule for. */
const CASES: Array<[string, CapacityForecast, "step" | "curve"]> = [
    ["every run finished", forecast(), "step"],
    ["every run finished, as a curve", forecast(), "curve"],
    [
        "runs stopped at the horizon, P95 at the horizon",
        forecast(
            { p95Days: 365, p95Date: "2027-06-01" },
            {
                unfinishedRuns: 80,
                days: bins([
                    [18, 50, 0.25],
                    [19, 70, 0.6],
                    [365, 80, 0.6],
                ]),
            },
        ),
        "step",
    ],
    [
        "no run finished: one bin at the horizon",
        forecast(
            { p50Days: 365, p85Days: 365, p95Days: 365 },
            { unfinishedRuns: 200, days: bins([[365, 200, 0]]) },
        ),
        "step",
    ],
    [
        "a horizon of 400 makes day 365 a normal day",
        forecast(
            {},
            {
                horizonDays: 400,
                days: bins([
                    [18, 50, 0.25],
                    [365, 150, 1],
                ]),
            },
        ),
        "step",
    ],
    [
        "nothing optional served: no run total, no horizon, no item count, no dates",
        forecast(
            {
                targetItems: undefined,
                p50Date: undefined,
                p85Date: undefined,
                p95Date: undefined,
            },
            {
                runs: null as unknown as number,
                unfinishedRuns: null as unknown as number,
                horizonDays: null as unknown as number,
            },
        ),
        "step",
    ],
    ["unfinished runs with no run total", forecast({}, { runs: 0, unfinishedRuns: 1 }), "step"],
    [
        "one item, one bin, P85 missing, P50 = P95 (no planning range)",
        forecast(
            { targetItems: 1, p50Days: 9, p85Days: undefined, p85Date: undefined, p95Days: 9 },
            { days: bins([[9, 200, 1]]) },
        ),
        "curve",
    ],
    [
        "dates in another calendar year",
        forecast(
            {
                computedAt: "2026-12-20T08:30:00Z",
                p50Date: "2027-01-08",
                p85Date: "2027-01-13",
                p95Date: "2027-01-16",
            },
            {},
        ),
        "step",
    ],
    ["no stored distribution", forecast({}, null), "step"],
    ["a distribution with no days", forecast({}, { days: [] }), "step"],
];

type Formatter<T> = (value: T) => string;
type DrawnOption = {
    xAxis: { max: number; axisLabel: { formatter: Formatter<number> } };
    yAxis: { axisLabel: { formatter: Formatter<number> } };
    tooltip: { formatter: Formatter<unknown> };
    series: Array<{ data: Array<[number, number]>; markLine?: { data: Array<{ xAxis: number }> } }>;
};

/** The option as data: each function becomes the text it gives for each value the chart draws. */
function drawn(option: DrawnOption) {
    const series = option.series[0]!;
    const days = new Set<number>([0, 1, 7, option.xAxis.max]);
    for (const [day] of series.data) days.add(day);
    for (const mark of series.markLine?.data ?? []) days.add(mark.xAxis);
    const sorted = [...days].sort((a, b) => a - b);
    return {
        option: JSON.parse(
            JSON.stringify(option, (_key, value: unknown) =>
                typeof value === "function" ? "[formatter]" : value,
            ),
        ) as unknown,
        dayAxis: Object.fromEntries(
            sorted.map((day) => [day, option.xAxis.axisLabel.formatter(day)]),
        ),
        chanceAxis: [0, 0.25, 0.5, 0.75, 1].map((share) => option.yAxis.axisLabel.formatter(share)),
        tooltips: series.data.map((data) => option.tooltip.formatter({ data })),
    };
}

beforeEach(() => {
    chartSpy.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
});

describe("CompletionRange — render pin (CHAOS-12622)", () => {
    it.each(CASES)("%s", (_name, served, interpolation) => {
        const { container } = render(
            <CompletionRange forecast={served} interpolation={interpolation} />,
        );
        const call = chartSpy.mock.calls.at(-1)?.[0] as { option: DrawnOption } | undefined;
        expect({
            markup: container.innerHTML,
            chart: call === undefined ? null : drawn(call.option),
        }).toMatchSnapshot();
    });
});
