import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, render, screen } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

// CHAOS-8477: the "Completion range" card. The curve is the Monte Carlo forecast as the API serves
// it: one point per served bin of `completionDistribution.days`, at the served day and the served
// `cumulativeShare`. The web adds nothing up and puts no point of its own on the curve. The three
// markers and the planning range are the forecast's own P50 / P85 / P95 days.

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

import { CompletionRange } from "./CompletionRange";

type Mark = {
    xAxis: number;
    label: {
        formatter: string;
        align?: string;
        offset: [number, number];
        rich: Record<"head" | "detail", { color: string; fontSize: number; fontWeight: number }>;
    };
};
type Series = {
    type: string;
    smooth?: boolean | number;
    smoothMonotone?: string;
    step?: string | boolean;
    data: Array<[number, number]>;
    markLine?: { data: Mark[] };
    markArea?: { data: Array<[{ xAxis: number; name?: string }, { xAxis: number }]> };
};
type Option = {
    grid: { top: number };
    xAxis: { type: string; min?: number; axisLabel: { formatter: (value: number) => string } };
    yAxis: {
        name?: string;
        min?: number;
        max?: number;
        axisLabel: { formatter: (value: number) => string };
    };
    tooltip: { formatter: (params: unknown) => string };
    series: Series[];
};
const option = () => (chartSpy.mock.calls.at(-1)?.[0] as { option: Option }).option;
const curve = () => option().series[0];
/** The lines of a marker label as a reader sees them: the style tags of the chart are cut. */
const lines = (mark: Mark) => mark.label.formatter.replace(/\{\w+\|([^}]*)\}/gu, "$1").split("\n");
const labels = () => curve().markLine!.data.map(lines);

type Distribution = NonNullable<CapacityForecast["completionDistribution"]>;
const base = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T08:30:00Z",
    // The two counts differ on purpose (a fixed-scope target): the simulation ran on the served
    // `targetItems`; `backlogSize` is the whole loaded backlog of the scope.
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
    completionDistribution: {
        runs: 200,
        // every run finished inside the horizon
        unfinishedRuns: 0,
        horizonDays: 365,
        days: [
            { value: 18, count: 50, cumulativeShare: 0.25 },
            { value: 19, count: 120, cumulativeShare: 0.85 },
            { value: 27, count: 30, cumulativeShare: 1 },
        ],
        items: null,
    },
    ...over,
});

beforeEach(() => {
    chartSpy.mockClear();
    // A date shows its year when it is not in this year, so "today" is fixed: the day the fixture
    // forecast was computed.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
});

describe("CompletionRange — the curve is the served points", () => {
    it("draws one point per served bin: the served day and the served cumulative share", () => {
        render(<CompletionRange forecast={base()} />);

        expect(chartSpy).toHaveBeenCalledTimes(1);
        expect(option().series).toHaveLength(1);
        expect(curve().type).toBe("line");
        expect(curve().data).toEqual([
            [18, 0.25],
            [19, 0.85],
            [27, 1],
        ]);
        // A monotone curve through the served points: no step, no overshoot (CHAOS-8833).
        expect(curve().smooth).toBe(true);
        expect(curve().smoothMonotone).toBe("x");
        expect(curve().step).toBeUndefined();
    });

    it("uses the SERVED share, not a sum of the counts and not the run total", () => {
        // Counts and shares that do not agree on purpose: a curve made in the web from the counts
        // (50, 170, 200 of 200) would read 0.25, 0.85, 1. The chart must show what was served.
        const forecast = base({
            completionDistribution: {
                runs: 999,
                unfinishedRuns: 0,
                horizonDays: 365,
                days: [
                    { value: 18, count: 50, cumulativeShare: 0.1 },
                    { value: 19, count: 120, cumulativeShare: 0.2 },
                    { value: 27, count: 30, cumulativeShare: 0.4 },
                ],
                items: null,
            },
        });
        render(<CompletionRange forecast={forecast} />);

        expect(curve().data).toEqual([
            [18, 0.1],
            [19, 0.2],
            [27, 0.4],
        ]);
    });

    it("adds no point of its own: no point at day 0 and none between two bins", () => {
        render(<CompletionRange forecast={base()} />);
        expect(curve().data.map(([day]) => day)).toEqual([18, 19, 27]);
    });

    it("names the chance axis with the served simulated item count (`targetItems`, not the backlog), from 0 to 100%", () => {
        render(<CompletionRange forecast={base()} />);
        expect(option().yAxis).toMatchObject({
            name: "Chance all 40 items are done",
            min: 0,
            max: 1,
        });
        expect(option().yAxis.axisLabel.formatter(0.5)).toBe("50%");
        expect(option().yAxis.axisLabel.formatter(1)).toBe("100%");
    });

    it("says item, not items, for one simulated item", () => {
        render(<CompletionRange forecast={base({ targetItems: 1 })} />);
        expect(option().yAxis.name).toBe("Chance the 1 item is done");
        expect(screen.getByTestId("completion-range-note")).toHaveTextContent(
            "in which the 1 item was done by that day.",
        );
    });

    it.each([
        ["null", null as unknown as undefined],
        ["absent", undefined],
    ])(
        "gives no count when the simulated item count is not served (%s): the backlog size is not put in its place",
        (_name, targetItems) => {
            render(<CompletionRange forecast={base({ targetItems })} />);
            expect(option().yAxis.name).toBe("Chance all items are done");
            const note = screen.getByTestId("completion-range-note");
            expect(note).toHaveTextContent(
                "Monte Carlo forecast: each step is the share of the 200 simulation runs in which all items were done by that day.",
            );
            expect(note.textContent).not.toContain("55");
        },
    );

    it("prints a served count of zero as it is served", () => {
        render(<CompletionRange forecast={base({ targetItems: 0 })} />);
        expect(option().yAxis.name).toBe("Chance all 0 items are done");
    });

    it("starts the day axis at the day the forecast was computed and labels days as dates", () => {
        render(<CompletionRange forecast={base()} />);
        const { xAxis } = option();
        expect(xAxis.type).toBe("value");
        expect(xAxis.min).toBe(0);
        // Day 19 after 2026-06-01 is 2026-06-20: the same day as the served P50 date.
        expect(xAxis.axisLabel.formatter(19)).toBe("Jun 20");
        expect(xAxis.axisLabel.formatter(0)).toBe("Jun 1");
    });
});

describe("CompletionRange — markers and planning range", () => {
    it("puts the markers at the forecast's own P50 / P85 / P95 days, with the served dates", () => {
        // 24 is a day with no bin: the marker stays at its served day and is not moved to a bin.
        render(<CompletionRange forecast={base()} />);
        const marks = curve().markLine!.data;
        expect(marks.map((mark) => mark.xAxis)).toEqual([19, 24, 27]);
        expect(marks.map(lines)).toEqual([
            ["P50 · Jun 20", "Optimistic · 19 days"],
            ["P85 · Jun 25", "Target · 24 days"],
            ["P95 · Jun 28", "Conservative · 27 days"],
        ]);
    });

    // CHAOS-8614: the label is two lines as the prototype. The first line is the percentile and
    // its served date; the second line is the role word and the served days.
    it("draws each label as two lines: the percentile and its date, then the role word and the days", () => {
        render(<CompletionRange forecast={base()} />);
        const [p50, p85] = curve().markLine!.data;
        expect(p50.label.formatter).toBe("{head|P50 · Jun 20}\n{detail|Optimistic · 19 days}");
        // the first line is the text colour and bold; the second line is muted and regular
        expect(p50.label.rich.head).toMatchObject({ color: chartTheme.text, fontSize: 11 });
        expect(p50.label.rich.detail).toMatchObject({
            color: chartTheme.muted,
            fontSize: 11,
            fontWeight: 400,
        });
        expect(p50.label.rich.head.fontWeight).toBeGreaterThan(p50.label.rich.detail.fontWeight);
        // the recommended P85 stays the heavier label
        expect(p85.label.rich.head.fontWeight).toBeGreaterThan(p50.label.rich.head.fontWeight);
    });

    it("gives the percentile name alone on the first line when its date is not served", () => {
        render(<CompletionRange forecast={base({ p50Date: undefined })} />);
        expect(labels()[0]).toEqual(["P50", "Optimistic · 19 days"]);
    });

    it("leaves out the marker of a percentile that is not served", () => {
        render(<CompletionRange forecast={base({ p85Days: undefined, p85Date: undefined })} />);
        expect(curve().markLine!.data.map((mark) => mark.xAxis)).toEqual([19, 27]);
    });

    it("marks the planning range between the served P50 and P95 days", () => {
        render(<CompletionRange forecast={base()} />);
        const [[from, to]] = curve().markArea!.data;
        expect(from).toMatchObject({ xAxis: 19, name: "planning range" });
        expect(to).toMatchObject({ xAxis: 27 });
    });

    it.each([
        ["P50 is not served", { p50Days: undefined }],
        ["P95 is not served", { p95Days: undefined }],
        ["the three are the same day", { p50Days: 19, p85Days: 19, p95Days: 19 }],
    ] as const)("draws no planning range when %s", (_name, over) => {
        render(<CompletionRange forecast={base(over)} />);
        expect(curve().markArea).toBeUndefined();
    });
});

describe("CompletionRange — words", () => {
    it("says what a point is, with the served run total", () => {
        render(<CompletionRange forecast={base()} />);
        expect(screen.getByTestId("completion-range-note")).toHaveTextContent(
            "Monte Carlo forecast: each step is the share of the 200 simulation runs in which all 40 items were done by that day.",
        );
    });

    // CHAOS-8614: the planning-choice sentence is the prototype's note paragraph: body size and
    // body colour, not a small muted line.
    it("prints the planning-choice sentence at body size and in the body colour", () => {
        render(<CompletionRange forecast={base()} />);
        const advice = screen.getByTestId("completion-range-advice");
        expect(advice).toHaveTextContent(
            /^Use the target and conservative dates as different planning choices, not as one promise\.$/u,
        );
        expect(advice).toHaveClass("text-[0.8125rem]", "text-foreground");
        expect(advice).not.toHaveClass("text-xs");
        expect(advice.className).not.toContain("muted");
        // the two notes above it stay small and muted
        expect(screen.getByTestId("completion-range-note")).toHaveClass("text-xs");
    });

    it("the tooltip gives the served share, the day and the served counts", () => {
        render(<CompletionRange forecast={base()} />);
        const text = option().tooltip.formatter({ data: [19, 0.85] });
        expect(text).toContain("Jun 20");
        expect(text).toContain("19 days");
        expect(text).toContain("85% of the runs were done by this day");
        expect(text).toContain("120 of 200 runs ended on this day");
    });

    it("says nothing about a run total that is not served", () => {
        const forecast = base();
        const withoutRuns = {
            days: forecast.completionDistribution!.days,
            items: null,
        } as unknown as Distribution;
        render(<CompletionRange forecast={{ ...forecast, completionDistribution: withoutRuns }} />);

        expect(screen.getByTestId("completion-range-note")).toHaveTextContent(
            "Monte Carlo forecast: each step is the share of the simulation runs in which all 40 items were done by that day.",
        );
        const text = option().tooltip.formatter({ data: [19, 0.85] });
        expect(text).toContain("120 runs ended on this day");
        expect(text).not.toMatch(/\bof 2\d\d\b/u);
    });
});

// CHAOS-8532: the simulation stops a run at the horizon (365 days, served as `horizonDays`). A run
// that is stopped there is NOT done. The API counts only the finished runs in `cumulativeShare`,
// so the curve can end below 100%, and it serves how many runs did not finish. The card shows that
// as served: it never closes the curve and it never names a date for "the horizon or later".
describe("CompletionRange — runs that did not finish inside the horizon", () => {
    // 200 runs: 50 done on day 18, 70 on day 19, and 80 stopped at the horizon, not done.
    const capped = (over: Partial<Distribution> = {}, forecast: Partial<CapacityForecast> = {}) =>
        base({
            p50Days: 19,
            p85Days: 365,
            p95Days: 365,
            p50Date: "2026-06-20",
            p85Date: "2027-06-01",
            p95Date: "2027-06-01",
            completionDistribution: {
                runs: 200,
                unfinishedRuns: 80,
                horizonDays: 365,
                days: [
                    { value: 18, count: 50, cumulativeShare: 0.25 },
                    { value: 19, count: 70, cumulativeShare: 0.6 },
                    { value: 365, count: 80, cumulativeShare: 0.6 },
                ],
                items: null,
                ...over,
            },
            ...forecast,
        });
    const unfinishedLine = () => screen.queryByTestId("completion-range-unfinished");

    it("draws the curve as served: it ends below 100% and is not closed to 100%", () => {
        render(<CompletionRange forecast={capped()} />);
        expect(curve().data).toEqual([
            [18, 0.25],
            [19, 0.6],
            [365, 0.6],
        ]);
        expect(Math.max(...curve().data.map(([, share]) => share))).toBe(0.6);
    });

    it("says how many runs did not finish, with the served numbers and the served horizon", () => {
        render(<CompletionRange forecast={capped()} />);
        expect(unfinishedLine()).toHaveTextContent(
            /^80 of 200 runs did not finish within 365 days\.$/u,
        );
    });

    it("takes the horizon from the API: it has no 365 of its own", () => {
        render(
            <CompletionRange
                forecast={capped({
                    horizonDays: 200,
                    days: [
                        { value: 18, count: 50, cumulativeShare: 0.25 },
                        { value: 200, count: 150, cumulativeShare: 0.25 },
                    ],
                    unfinishedRuns: 150,
                })}
            />,
        );
        expect(unfinishedLine()).toHaveTextContent(
            /^150 of 200 runs did not finish within 200 days\.$/u,
        );
    });

    it("says nothing about unfinished runs when every run finished", () => {
        render(<CompletionRange forecast={base()} />);
        expect(unfinishedLine()).toBeNull();
    });

    it.each([
        ["null", null],
        ["absent", undefined],
    ])(
        "says nothing when the count of unfinished runs is not served (%s): it counts none itself",
        (_name, unfinishedRuns) => {
            render(<CompletionRange forecast={capped({ unfinishedRuns })} />);
            expect(unfinishedLine()).toBeNull();
            // the curve is still the served points
            expect(curve().data.at(-1)).toEqual([365, 0.6]);
        },
    );

    it("says nothing when the horizon is not served: it has no horizon of its own to name", () => {
        const forecast = capped();
        const withoutHorizon = {
            ...forecast.completionDistribution!,
            horizonDays: undefined,
        } as unknown as Distribution;
        render(
            <CompletionRange forecast={{ ...forecast, completionDistribution: withoutHorizon }} />,
        );
        expect(unfinishedLine()).toBeNull();
        // with no served horizon no day is "the horizon": the markers keep their served dates
        expect(labels()[1]).toEqual(["P85 · Jun 1, 2027", "Target · 365 days"]);
    });

    it("leaves the run total out of the sentence when it is not served", () => {
        const forecast = capped();
        const withoutRuns = {
            ...forecast.completionDistribution!,
            runs: undefined,
        } as unknown as Distribution;
        render(<CompletionRange forecast={{ ...forecast, completionDistribution: withoutRuns }} />);
        expect(unfinishedLine()).toHaveTextContent(/^80 runs did not finish within 365 days\.$/u);
    });

    it("says run, not runs, for one unfinished run with no served total", () => {
        const forecast = capped({ unfinishedRuns: 1 });
        const withoutRuns = {
            ...forecast.completionDistribution!,
            runs: undefined,
        } as unknown as Distribution;
        render(<CompletionRange forecast={{ ...forecast, completionDistribution: withoutRuns }} />);
        expect(unfinishedLine()).toHaveTextContent(/^1 run did not finish within 365 days\.$/u);
    });

    it("a percentile at the horizon reads 'or more' and names no date; the others keep their date", () => {
        render(<CompletionRange forecast={capped()} />);
        expect(curve().markLine!.data.map((mark) => [mark.xAxis, lines(mark)])).toEqual([
            [19, ["P50 · Jun 20", "Optimistic · 19 days"]],
            [365, ["P85", "Target · 365 days or more"]],
            [365, ["P95", "Conservative · 365 days or more"]],
        ]);
    });

    it("the tooltip of the horizon bin says the runs did not finish, not that they ended on that day", () => {
        render(<CompletionRange forecast={capped()} />);
        const text = option().tooltip.formatter({ data: [365, 0.6] });
        expect(text).toContain("365 days or more after the forecast");
        expect(text).toContain("60% of the runs were done by this day");
        expect(text).toContain("80 of 200 runs did not finish within 365 days");
        expect(text).not.toContain("ended on this day");
        // the heading is not a finish date
        expect(text).toContain("or later");
    });

    it("a bin before the horizon keeps its words", () => {
        render(<CompletionRange forecast={capped()} />);
        const text = option().tooltip.formatter({ data: [19, 0.6] });
        expect(text).toContain("19 days after the forecast");
        expect(text).toContain("70 of 200 runs ended on this day");
        expect(text).not.toContain("or more");
        expect(text).not.toContain("or later");
    });

    it("a day equal to 365 is a normal day when the served horizon is another number", () => {
        render(
            <CompletionRange
                forecast={capped(
                    { horizonDays: 400, unfinishedRuns: 0 },
                    { p85Days: 365, p95Days: 365 },
                )}
            />,
        );
        const text = option().tooltip.formatter({ data: [365, 0.6] });
        expect(text).toContain("80 of 200 runs ended on this day");
        expect(labels()[1]).toEqual(["P85 · Jun 1, 2027", "Target · 365 days"]);
    });

    it("draws the curve also when no run finished: one served point at 0%", () => {
        render(
            <CompletionRange
                forecast={capped(
                    { unfinishedRuns: 200, days: [{ value: 365, count: 200, cumulativeShare: 0 }] },
                    { p50Days: 365, p85Days: 365, p95Days: 365 },
                )}
            />,
        );
        expect(curve().data).toEqual([[365, 0]]);
        expect(unfinishedLine()).toHaveTextContent(
            /^200 of 200 runs did not finish within 365 days\.$/u,
        );
        expect(screen.getByTestId("completion-range")).not.toHaveAttribute(
            "data-reported",
            "false",
        );
    });
});

// CHAOS-8556: one date rule on the page. A date in another calendar year than today shows its
// year, on the card as on the tiles: "Jan 31" for a day in the next year reads as a day of this
// year.
describe("CompletionRange — dates in another calendar year", () => {
    const longForecast = () =>
        base({
            computedAt: "2026-10-03T19:05:00Z",
            p50Days: 1,
            p85Days: 100,
            p95Days: 120,
            p50Date: "2026-10-04",
            p85Date: "2027-01-11",
            p95Date: "2027-01-31",
            completionDistribution: {
                runs: 100,
                unfinishedRuns: 0,
                horizonDays: 365,
                days: [
                    { value: 1, count: 60, cumulativeShare: 0.6 },
                    { value: 100, count: 26, cumulativeShare: 0.86 },
                    { value: 120, count: 14, cumulativeShare: 1 },
                ],
                items: null,
            },
        });

    it("a marker shows the year of a served date in another year, and no year for this year", () => {
        vi.setSystemTime(new Date("2026-10-03T20:00:00Z"));
        render(<CompletionRange forecast={longForecast()} />);
        expect(labels()).toEqual([
            ["P50 · Oct 4", "Optimistic · 1 day"],
            ["P85 · Jan 11, 2027", "Target · 100 days"],
            ["P95 · Jan 31, 2027", "Conservative · 120 days"],
        ]);
    });

    // A label with a year is longer. A marker near the right end of the axis has its label end
    // at the line, so the label is not cut at the edge of the chart; the others stay centred.
    it("the label of a marker near the right end of the axis ends at its line, so it is not cut off", () => {
        vi.setSystemTime(new Date("2026-10-03T20:00:00Z"));
        render(<CompletionRange forecast={longForecast()} />);
        expect(
            curve().markLine!.data.map((mark) => [mark.xAxis, mark.label.align ?? "center"]),
        ).toEqual([
            [1, "center"],
            [100, "center"],
            [120, "right"],
        ]);
    });

    it("the day axis and the tooltip heading show the year of a day in another year", () => {
        vi.setSystemTime(new Date("2026-10-03T20:00:00Z"));
        render(<CompletionRange forecast={longForecast()} />);
        const { xAxis, tooltip } = option();
        expect(xAxis.axisLabel.formatter(1)).toBe("Oct 4");
        expect(xAxis.axisLabel.formatter(100)).toBe("Jan 11, 2027");
        expect(tooltip.formatter({ data: [120, 1] })).toContain("Jan 31, 2027");
        expect(tooltip.formatter({ data: [1, 0.6] })).not.toContain("2026");
    });
});

// CHAOS-8614: where the marker labels sit above the plot. Labels with room share the row next to
// the plot, as the prototype draws them. Labels that would touch (two percentiles on one day, or
// on near days) go to different rows, so no label prints on top of another. The rows come from
// the measured width of the chart; until it is measured each label has its own row.
describe("CompletionRange — marker label rows", () => {
    /** Two text lines of 14px: the height of one label row. */
    const ROW = 28;
    let resize: ((width: number) => void) | null = null;
    const measure = (width: number) => act(() => resize!(width));
    const rows = () => curve().markLine!.data.map((mark) => Math.abs(mark.label.offset[1]) / ROW);

    beforeEach(() => {
        resize = null;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(
                    callback: (entries: Array<{ contentRect: { width: number } }>) => void,
                ) {
                    resize = (width) => callback([{ contentRect: { width } }]);
                }
                observe() {}
                disconnect() {}
            },
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // Days 10, 40 and 70 of a 100-day curve: the three labels are far from each other.
    const spread = () =>
        base({
            p50Days: 10,
            p85Days: 40,
            p95Days: 70,
            p50Date: "2026-06-11",
            p85Date: "2026-07-11",
            p95Date: "2026-08-10",
            completionDistribution: {
                runs: 200,
                unfinishedRuns: 0,
                horizonDays: 365,
                days: [
                    { value: 10, count: 100, cumulativeShare: 0.5 },
                    { value: 40, count: 70, cumulativeShare: 0.85 },
                    { value: 100, count: 30, cumulativeShare: 1 },
                ],
                items: null,
            },
        });
    // P50 and P85 on one day (the data case of the audit), P95 later.
    const sameDay = () => base({ p50Days: 19, p85Days: 19, p85Date: "2026-06-20", p95Days: 27 });

    it("gives each label its own row until the width is measured, so the labels never collide", () => {
        render(<CompletionRange forecast={spread()} />);
        expect(rows()).toEqual([0, 1, 2]);
        // room above the plot for the three rows
        expect(option().grid.top).toBe(24 + 3 * ROW);
    });

    it("puts labels with room in one row, as the prototype draws them", () => {
        render(<CompletionRange forecast={spread()} />);
        measure(1000);
        expect(rows()).toEqual([0, 0, 0]);
        expect(curve().markLine!.data.map((mark) => mark.label.offset)).toEqual([
            [0, 0],
            [0, 0],
            [0, 0],
        ]);
        // room above the plot for the one row
        expect(option().grid.top).toBe(24 + ROW);
    });

    it("puts two percentiles of one day in different rows: their labels do not overlap", () => {
        render(<CompletionRange forecast={sameDay()} />);
        measure(1000);
        const marks = curve().markLine!.data;
        expect(marks.map((mark) => mark.xAxis)).toEqual([19, 19, 27]);
        expect(labels().slice(0, 2)).toEqual([
            ["P50 · Jun 20", "Optimistic · 19 days"],
            ["P85 · Jun 20", "Target · 19 days"],
        ]);
        // P50 next to the plot, P85 one row up; P95 has room beside P50 in the first row.
        expect(rows()).toEqual([0, 1, 0]);
        expect(marks[1].label.offset).toEqual([0, -ROW]);
        expect(option().grid.top).toBe(24 + 2 * ROW);
    });

    it("puts labels of near days in different rows when the chart is too narrow for one row", () => {
        render(<CompletionRange forecast={spread()} />);
        measure(1000);
        expect(rows()).toEqual([0, 0, 0]);
        // A narrow chart (a phone): the same three labels no longer fit side by side.
        measure(300);
        expect(rows()).toEqual([0, 1, 2]);
        expect(option().grid.top).toBe(24 + 3 * ROW);
    });

    it("does not draw the chart again when a new width changes no row", () => {
        render(<CompletionRange forecast={spread()} />);
        measure(1000);
        const drawn = chartSpy.mock.calls.at(-1)?.[0] as { option: Option };
        measure(1010);
        expect((chartSpy.mock.calls.at(-1)?.[0] as { option: Option }).option).toBe(drawn.option);
    });

    it("does not take a width of zero as a measurement: the last measured width stays", () => {
        render(<CompletionRange forecast={spread()} />);
        measure(0);
        expect(rows()).toEqual([0, 1, 2]);
        measure(1000);
        expect(rows()).toEqual([0, 0, 0]);
        // a hidden chart reports zero: the rows of the last real width stay
        measure(0);
        expect(rows()).toEqual([0, 0, 0]);
    });

    it("works with no ResizeObserver: each label keeps its own row", () => {
        vi.stubGlobal("ResizeObserver", undefined);
        render(<CompletionRange forecast={sameDay()} />);
        expect(rows()).toEqual([0, 1, 2]);
    });
});

describe("CompletionRange — not served is never an empty or made-up curve", () => {
    it.each([
        ["no distribution", null],
        ["an answer with no such field", undefined],
        ["a distribution with no days list", { runs: 200, days: null, items: null }],
        ["a days list with no bin", { runs: 200, days: [], items: null }],
        [
            "only the items mode",
            { runs: 200, days: null, items: [{ value: 30, count: 200, cumulativeShare: 1 }] },
        ],
    ] as const)("reads Not reported and draws no chart: %s", (_name, completionDistribution) => {
        render(
            <CompletionRange
                forecast={base({
                    completionDistribution: completionDistribution as
                        Distribution | null | undefined,
                })}
            />,
        );

        expect(chartSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("chart")).toBeNull();
        const state = screen.getByTestId("completion-range");
        expect(state).toHaveAttribute("data-reported", "false");
        expect(state).toHaveTextContent(/^Not reported/u);
        expect(state).toHaveTextContent(
            "The forecast has no simulation distribution, so no chance curve is drawn.",
        );
    });
});
