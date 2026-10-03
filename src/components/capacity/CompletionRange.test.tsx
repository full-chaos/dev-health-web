import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";
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

type Mark = { xAxis: number; label: { formatter: string } };
type Series = {
    type: string;
    step?: string;
    data: Array<[number, number]>;
    markLine?: { data: Mark[] };
    markArea?: { data: Array<[{ xAxis: number; name?: string }, { xAxis: number }]> };
};
type Option = {
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
        days: [
            { value: 18, count: 50, cumulativeShare: 0.25 },
            { value: 19, count: 120, cumulativeShare: 0.85 },
            { value: 27, count: 30, cumulativeShare: 1 },
        ],
        items: null,
    },
    ...over,
});

beforeEach(() => chartSpy.mockClear());

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
        // A day nobody ended on keeps the share of the day before: a step, not a slope.
        expect(curve().step).toBe("end");
    });

    it("uses the SERVED share, not a sum of the counts and not the run total", () => {
        // Counts and shares that do not agree on purpose: a curve made in the web from the counts
        // (50, 170, 200 of 200) would read 0.25, 0.85, 1. The chart must show what was served.
        const forecast = base({
            completionDistribution: {
                runs: 999,
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
        expect(marks.map((mark) => mark.label.formatter)).toEqual([
            "P50 · Jun 20 · 19 days",
            "P85 · Jun 25 · 24 days",
            "P95 · Jun 28 · 27 days",
        ]);
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
