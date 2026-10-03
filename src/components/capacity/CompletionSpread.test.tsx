import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

// CHAOS-7977: the Monte Carlo spread on /plan/capacity is drawn from the API's
// `completionDistribution` and nothing else. Every number on the chart is a number
// the API returned: bin values and run counts as they are, the percentile markers from
// the forecast's own p50/p85/p95 fields.

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#aa0001",
    accent2: "#aa0002",
    accent3: "#aa0003",
};
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => ["#0b8fb0", "#c98500"],
}));
vi.mock("@/components/charts/Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

import { CompletionSpread } from "./CompletionSpread";

type Mark = { xAxis: number; label: { formatter: string } };
type Series = {
    type: string;
    name?: string;
    yAxisIndex?: number;
    step?: string;
    data: Array<[number, number]>;
    markLine?: { data: Mark[] };
    markArea?: { data: Array<[{ xAxis: number; name?: string }, { xAxis: number }]> };
};
type Option = {
    xAxis: { type: string; name?: string };
    yAxis: Array<{ name?: string; min?: number; max?: number }>;
    tooltip: { formatter: (params: unknown) => string };
    series: Series[];
};
const options = () => chartSpy.mock.calls.map((call) => (call[0] as { option: Option }).option);

const base = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    p50Date: "2026-06-10",
    p85Date: "2026-06-20",
    p95Date: "2026-07-01",
    p50Days: 19,
    p85Days: 24,
    p95Days: 27,
    throughputMean: 3.25,
    throughputStddev: 1.1,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
    completionDistribution: {
        runs: 200,
        days: [
            { value: 18, count: 50 },
            { value: 19, count: 120 },
            { value: 24, count: 30 },
        ],
        items: null,
    },
    ...over,
});

beforeEach(() => chartSpy.mockClear());

describe("CompletionSpread — the days histogram", () => {
    it("draws the bins exactly as the API returned them: raw run counts, no normalising, no smoothing", () => {
        render(<CompletionSpread forecast={base()} />);

        expect(options()).toHaveLength(1);
        const [series] = options()[0].series;
        expect(series.type).toBe("bar");
        expect(series.data).toEqual([
            [18, 50],
            [19, 120],
            [24, 30],
        ]);
        expect(options()[0].yAxis[0].name).toBe("Simulation runs");
    });

    it("puts the markers where the forecast's OWN p50 / p85 / p95 say, not where the bins would put them", () => {
        // The bins say the median is 19; the forecast says 40. The chart must follow the forecast:
        // a chart that recomputed percentiles would disagree with the tiles above it.
        render(<CompletionSpread forecast={base({ p50Days: 40, p85Days: 41, p95Days: 42 })} />);
        const marks = options()[0].series[0].markLine!.data;
        expect(marks.map((m) => m.xAxis)).toEqual([40, 41, 42]);
        expect(marks[0].label.formatter).toContain("P50");
        expect(marks[0].label.formatter).toContain("40 days");
    });

    it("says how many runs ended on a value, of the SERVED run total", () => {
        render(<CompletionSpread forecast={base()} />);
        const text = options()[0].tooltip.formatter({ seriesType: "bar", data: [19, 120] });
        expect(text).toContain("120 of 200 runs ended here");
        expect(text).toContain("Day 19");
    });

    it("says 1 run, not 1 runs", () => {
        render(<CompletionSpread forecast={base()} />);
        expect(options()[0].tooltip.formatter({ seriesType: "bar", data: [19, 1] })).toContain(
            "1 of 200 runs ended here",
        );
    });

    it("skips a marker whose percentile the forecast does not carry", () => {
        render(<CompletionSpread forecast={base({ p85Days: undefined })} />);
        expect(options()[0].series[0].markLine!.data.map((m) => m.xAxis)).toEqual([19, 27]);
    });

    it("says so when every run ended on the same value", () => {
        render(
            <CompletionSpread
                forecast={base({
                    completionDistribution: {
                        runs: 200,
                        days: [{ value: 9, count: 200 }],
                        items: null,
                    },
                })}
            />,
        );
        expect(screen.getByText("Every simulated run ended on the same day.")).toBeInTheDocument();
        expect(options()[0].series[0].data).toEqual([[9, 200]]);
    });
});

describe("CompletionSpread — states, never zero-filled", () => {
    it("a null distribution reads 'Not reported' and draws no chart", () => {
        render(<CompletionSpread forecast={base({ completionDistribution: null })} />);

        expect(chartSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("chart")).toBeNull();
        // Not served: the state word of the rule, then why. Never an empty chart, never a zero.
        const state = screen.getByTestId("completion-spread");
        expect(state).toHaveAttribute("data-reported", "false");
        expect(state).toHaveTextContent(/^Not reported/);
        expect(state).toHaveTextContent("No simulation spread is stored for this forecast.");
    });

    it("a missing field is the same as null (an older response)", () => {
        render(<CompletionSpread forecast={base({ completionDistribution: undefined })} />);
        expect(screen.queryByTestId("chart")).toBeNull();
        // Not served: the state word of the rule, then why. Never an empty chart, never a zero.
        const state = screen.getByTestId("completion-spread");
        expect(state).toHaveAttribute("data-reported", "false");
        expect(state).toHaveTextContent(/^Not reported/);
        expect(state).toHaveTextContent("No simulation spread is stored for this forecast.");
    });

    it("an object with both lists null or empty is also no distribution", () => {
        render(
            <CompletionSpread
                forecast={base({ completionDistribution: { runs: 200, days: [], items: null } })}
            />,
        );
        expect(screen.queryByTestId("chart")).toBeNull();
        // Not served: the state word of the rule, then why. Never an empty chart, never a zero.
        const state = screen.getByTestId("completion-spread");
        expect(state).toHaveAttribute("data-reported", "false");
        expect(state).toHaveTextContent(/^Not reported/);
        expect(state).toHaveTextContent("No simulation spread is stored for this forecast.");
    });

    it("an items-only distribution draws only the items chart, with the items percentiles", () => {
        render(
            <CompletionSpread
                forecast={base({
                    p50Items: 40,
                    p85Items: 35,
                    p95Items: 30,
                    completionDistribution: {
                        runs: 100,
                        days: null,
                        items: [
                            { value: 30, count: 10 },
                            { value: 40, count: 90 },
                        ],
                    },
                })}
            />,
        );
        expect(options()).toHaveLength(1);
        expect(options()[0].series[0].data).toEqual([
            [30, 10],
            [40, 90],
        ]);
        expect(options()[0].series[0].markLine!.data.map((m) => m.xAxis)).toEqual([40, 35, 30]);
        expect(options()[0].series[0].markLine!.data[0].label.formatter).toContain("40 items");
        expect(screen.getByText("Items completed by the target date")).toBeInTheDocument();
        expect(screen.queryByText("Days to finish the target items")).toBeNull();
    });

    it("both modes draw two charts, days first", () => {
        render(
            <CompletionSpread
                forecast={base({
                    completionDistribution: {
                        runs: 10,
                        days: [
                            { value: 19, count: 5 },
                            { value: 20, count: 5 },
                        ],
                        items: [
                            { value: 40, count: 3 },
                            { value: 41, count: 7 },
                        ],
                    },
                })}
            />,
        );
        expect(options()).toHaveLength(2);
        expect(options()[0].series[0].data).toEqual([
            [19, 5],
            [20, 5],
        ]);
        expect(options()[1].series[0].data).toEqual([
            [40, 3],
            [41, 7],
        ]);
    });

    it("reads as a range, not a promise, and names the history it rests on", () => {
        render(<CompletionSpread forecast={base()} />);
        const region = within(screen.getByTestId("completion-spread"));
        expect(
            region.getByText(/Based on 90 days of history; read it as a range, not a promise\./),
        ).toBeInTheDocument();
    });
});

// CHAOS-8477: the API serves the run total (`runs`). The chance curve is the running sum of the
// SERVED counts over the SERVED total (the rule the contract itself gives); the web adds up no
// total of its own, and with no served total it draws no curve.
describe("CompletionSpread — the served run total and the chance curve", () => {
    const bars = (option: Option) => option.series.find((series) => series.type === "bar")!;
    const curve = (option: Option) => option.series.find((series) => series.type === "line");
    /** An answer from before the field existed: the distribution with no `runs`. */
    const withoutRuns = (distribution: {
        days: Array<{ value: number; count: number }> | null;
        items: Array<{ value: number; count: number }> | null;
    }) => distribution as unknown as NonNullable<CapacityForecast["completionDistribution"]>;

    it("draws the chance of being done by each day: running sum of the counts over the served runs", () => {
        render(<CompletionSpread forecast={base({ targetItems: 42 })} />);
        const option = options()[0];

        expect(curve(option)!.data).toEqual([
            [18, 25],
            [19, 85],
            [24, 100],
        ]);
        expect(curve(option)!.yAxisIndex).toBe(1);
        // A day nobody ended on keeps the chance of the day before: a step, not a slope.
        expect(curve(option)!.step).toBe("end");
        expect(option.yAxis[1]).toMatchObject({
            name: "Chance all 42 items are done",
            min: 0,
            max: 100,
        });
        // The bars stay what they were: the served counts on the first axis.
        expect(bars(option).data).toEqual([
            [18, 50],
            [19, 120],
            [24, 30],
        ]);
    });

    it("divides by the SERVED run total, not by a sum of the bins", () => {
        // The bins sum to 200; the API says 400 runs. A curve from a web-made sum would end at 100%.
        const forecast = base({
            completionDistribution: {
                runs: 400,
                days: [
                    { value: 18, count: 50 },
                    { value: 19, count: 120 },
                    { value: 24, count: 30 },
                ],
                items: null,
            },
        });
        render(<CompletionSpread forecast={forecast} />);

        expect(curve(options()[0])!.data).toEqual([
            [18, 12.5],
            [19, 42.5],
            [24, 50],
        ]);
        expect(options()[0].tooltip.formatter({ seriesType: "bar", data: [19, 120] })).toContain(
            "120 of 400 runs ended here",
        );
    });

    it("says the chance in words on a bar and on the curve", () => {
        render(<CompletionSpread forecast={base()} />);
        const { formatter } = options()[0].tooltip;

        expect(formatter({ seriesType: "bar", data: [19, 120] })).toContain(
            "85% of the runs were done by day 19",
        );
        expect(formatter({ seriesType: "line", data: [18, 25] })).toContain(
            "25% of the runs were done by day 18",
        );
    });

    it("names the axis without a number when the target item count is not served", () => {
        render(<CompletionSpread forecast={base({ targetItems: undefined })} />);
        expect(options()[0].yAxis[1].name).toBe("Chance the target items are done");
    });

    it("shows the served run total under the chart", () => {
        render(<CompletionSpread forecast={base()} />);
        expect(screen.getByTestId("completion-spread-runs")).toHaveTextContent(
            /^200 simulation runs\.$/u,
        );
    });

    it("marks the planning range between the served P50 and P95 days", () => {
        render(<CompletionSpread forecast={base()} />);
        const area = curve(options()[0])!.markArea!.data;
        expect(area).toHaveLength(1);
        expect(area[0][0]).toMatchObject({ xAxis: 19, name: "planning range" });
        expect(area[0][1]).toMatchObject({ xAxis: 27 });
    });

    it.each([
        ["P50", { p50Days: undefined }],
        ["P95", { p95Days: undefined }],
        ["both the same day", { p50Days: 19, p85Days: 19, p95Days: 19 }],
    ] as const)("draws no planning range when it has no two ends (%s)", (_name, over) => {
        render(<CompletionSpread forecast={base(over)} />);
        expect(curve(options()[0])!.markArea).toBeUndefined();
    });

    it("draws no curve, no total and no chance when the run total is not served", () => {
        const forecast = base({
            completionDistribution: withoutRuns({
                days: [
                    { value: 18, count: 50 },
                    { value: 19, count: 120 },
                    { value: 24, count: 30 },
                ],
                items: null,
            }),
        });
        render(<CompletionSpread forecast={forecast} />);
        const option = options()[0];

        expect(curve(option)).toBeUndefined();
        expect(option.yAxis).toHaveLength(1);
        const text = option.tooltip.formatter({ seriesType: "bar", data: [19, 120] });
        expect(text).toContain("120 runs ended here");
        // The bins sum to 200. The web shows no total and no share it would have to add up.
        expect(text).not.toContain("200");
        expect(text).not.toMatch(/\bof\b/u);
        expect(text).not.toContain("%");
        expect(screen.queryByTestId("completion-spread-runs")).toBeNull();
        // The bars are still the served counts.
        expect(bars(option).data).toHaveLength(3);
    });

    it.each([0, -5])("treats a run total of %i as not served: nothing is divided by it", (runs) => {
        const forecast = base({
            completionDistribution: { runs, days: [{ value: 18, count: 50 }], items: null },
        });
        render(<CompletionSpread forecast={forecast} />);

        expect(curve(options()[0])).toBeUndefined();
        expect(screen.queryByTestId("completion-spread-runs")).toBeNull();
    });

    it("the items chart has the served total in its tooltip and no chance curve", () => {
        const forecast = base({
            p50Items: 40,
            p85Items: 35,
            p95Items: 30,
            completionDistribution: {
                runs: 100,
                days: null,
                items: [
                    { value: 30, count: 10 },
                    { value: 40, count: 90 },
                ],
            },
        });
        render(<CompletionSpread forecast={forecast} />);
        const option = options()[0];

        expect(curve(option)).toBeUndefined();
        expect(option.yAxis).toHaveLength(1);
        const text = option.tooltip.formatter({ seriesType: "bar", data: [40, 90] });
        expect(text).toContain("90 of 100 runs ended here");
        expect(text).not.toContain("%");
    });
});
