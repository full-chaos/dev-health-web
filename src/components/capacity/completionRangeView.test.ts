import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CapacityForecast } from "@/lib/graphql/types";

import {
    completionRangeInput,
    completionRangeView,
    type CompletionRangeInput,
} from "./completionRangeView";

// CHAOS-12622: the one mapping from a stored completion forecast to what the "Completion range"
// chart draws and says. The capacity page and the Ask Dev forecast slot both draw with it.

const input = (over: Partial<CompletionRangeInput> = {}): CompletionRangeInput => ({
    bins: [
        { day: 18, count: 50, cumulativeShare: 0.25 },
        { day: 19, count: 70, cumulativeShare: 0.6 },
        { day: 365, count: 80, cumulativeShare: 0.6 },
    ],
    computedAt: "2026-06-01T08:30:00Z",
    runs: 200,
    horizonDays: 365,
    unfinishedRuns: 80,
    targetItems: 40,
    percentiles: {
        P50: { days: 19, date: "2026-06-20" },
        P85: { days: 24, date: "2026-06-25" },
        P95: { days: 365, date: "2027-06-01" },
    },
    ...over,
});

const reported = (view: ReturnType<typeof completionRangeView>) => {
    if (!view.reported) throw new Error("expected a reported view");
    return view;
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
});

describe("completionRangeView", () => {
    it.each([
        ["absent", undefined],
        ["empty", []],
    ])("is not reported when the bins are %s: no empty or made-up curve", (_name, bins) => {
        expect(completionRangeView(input({ bins }))).toEqual({ reported: false });
    });

    it("draws the served bins as they are: no point of its own, the curve is not closed to 100%", () => {
        expect(reported(completionRangeView(input())).points).toEqual([
            { day: 18, share: 0.25 },
            { day: 19, share: 0.6 },
            { day: 365, share: 0.6 },
        ]);
    });

    it("a percentile at the horizon reads 'or more' and names no date; the others keep their date", () => {
        expect(reported(completionRangeView(input())).markers).toEqual([
            { name: "P50", day: 19, label: "P50 · Jun 20", detail: "Optimistic · 19 days" },
            { name: "P85", day: 24, label: "P85 · Jun 25", detail: "Target · 24 days" },
            { name: "P95", day: 365, label: "P95", detail: "Conservative · 365 days or more" },
        ]);
    });

    it("leaves out a percentile that is not served", () => {
        const view = reported(
            completionRangeView(
                input({
                    percentiles: {
                        P50: { days: 19, date: "2026-06-20" },
                        P85: {},
                        P95: { days: 27, date: "2026-06-28" },
                    },
                }),
            ),
        );
        expect(view.markers.map((marker) => marker.name)).toEqual(["P50", "P95"]);
    });

    it.each([
        ["P50 before P95", 19, 27, { from: 19, to: 27 }],
        ["P50 equal to P95", 19, 19, null],
        ["P50 after P95", 27, 19, null],
        ["P95 not served", 19, undefined, null],
    ])("draws the planning range only when P50 < P95 (%s)", (_name, p50, p95, range) => {
        const view = reported(
            completionRangeView(
                input({ percentiles: { P50: { days: p50 }, P85: {}, P95: { days: p95 } } }),
            ),
        );
        expect(view.planningRange).toEqual(range);
    });

    it("labels a day as its date, and the horizon day as 'that date or later'", () => {
        const { dayLabel } = reported(completionRangeView(input()));
        expect(dayLabel(0)).toBe("Jun 1");
        expect(dayLabel(19)).toBe("Jun 20");
        expect(dayLabel(365)).toBe("Jun 1, 2027 or later");
    });

    it("with no served horizon no day is 'the horizon'", () => {
        const view = reported(completionRangeView(input({ horizonDays: undefined })));
        expect(view.dayLabel(365)).toBe("Jun 1, 2027");
        expect(view.markers[2]).toMatchObject({ label: "P95 · Jun 1, 2027" });
        expect(view.unfinished).toBeNull();
    });

    it("the tooltip of the horizon bin says the runs did not finish; a bin before it says they ended", () => {
        const { tooltipLines } = reported(completionRangeView(input()));
        expect(tooltipLines({ day: 18, share: 0.25 })).toEqual([
            "18 days after the forecast",
            "25% of the runs were done by this day",
            "50 of 200 runs ended on this day",
        ]);
        expect(tooltipLines({ day: 365, share: 0.6 })).toEqual([
            "365 days or more after the forecast",
            "60% of the runs were done by this day",
            "80 of 200 runs did not finish within 365 days",
        ]);
    });

    it("says nothing about the runs of a bin whose count is not served", () => {
        const { tooltipLines } = reported(
            completionRangeView(input({ bins: [{ day: 18, cumulativeShare: 0.25 }] })),
        );
        expect(tooltipLines({ day: 18, share: 0.25 })).toEqual([
            "18 days after the forecast",
            "25% of the runs were done by this day",
        ]);
    });

    it.each([
        ["not served", undefined],
        ["zero", 0],
    ])("leaves the run total out of the words when it is %s", (_name, runs) => {
        const view = reported(completionRangeView(input({ runs })));
        expect(view.unfinished).toBe("80 runs did not finish within 365 days.");
        expect(view.note("step")).toBe(
            "Monte Carlo forecast: each step is the share of the simulation runs in which all 40 items were done by that day.",
        );
        expect(view.tooltipLines({ day: 18, share: 0.25 }).at(-1)).toBe(
            "50 runs ended on this day",
        );
    });

    it.each([
        ["no run stopped", 0],
        ["the count not served", undefined],
    ])("says nothing about unfinished runs with %s", (_name, unfinishedRuns) => {
        expect(reported(completionRangeView(input({ unfinishedRuns }))).unfinished).toBeNull();
    });

    it("names the served item count on the chance axis and in the note; none when it is not served", () => {
        const many = reported(completionRangeView(input()));
        expect(many.chanceAxisName).toBe("Chance all 40 items are done");
        expect(many.note("curve")).toBe(
            "Monte Carlo forecast: each point is the share of the 200 simulation runs in which all 40 items were done by that day.",
        );
        const one = reported(completionRangeView(input({ targetItems: 1 })));
        expect(one.chanceAxisName).toBe("Chance the 1 item is done");
        expect(one.note("step")).toContain("in which the 1 item was done by that day.");
        expect(
            reported(completionRangeView(input({ targetItems: undefined }))).chanceAxisName,
        ).toBe("Chance all items are done");
    });
});

describe("completionRangeInput (the capacity page's GraphQL form)", () => {
    const forecast: CapacityForecast = {
        forecastId: "f1",
        computedAt: "2026-06-01T08:30:00Z",
        backlogSize: 55,
        targetItems: 40,
        p50Date: "2026-06-20",
        p85Date: undefined,
        p95Date: "2026-06-28",
        p50Days: 19,
        p85Days: undefined,
        p95Days: 27,
        throughputMean: 3.25,
        throughputStddev: 1.1,
        historyDays: 90,
        insufficientHistory: false,
        highVariance: false,
        completionDistribution: {
            runs: 200,
            unfinishedRuns: null,
            horizonDays: 365,
            days: [{ value: 18, count: 50, cumulativeShare: 0.25 }],
            items: null,
        },
    };

    it("reads the served fields as they are, and a null as absent: no backlog in place of the item count", () => {
        expect(completionRangeInput(forecast)).toEqual({
            bins: [{ day: 18, count: 50, cumulativeShare: 0.25 }],
            computedAt: "2026-06-01T08:30:00Z",
            runs: 200,
            horizonDays: 365,
            unfinishedRuns: undefined,
            targetItems: 40,
            percentiles: {
                P50: { days: 19, date: "2026-06-20" },
                P85: { days: undefined, date: undefined },
                P95: { days: 27, date: "2026-06-28" },
            },
        });
    });

    it("has no bins when no distribution is stored", () => {
        expect(completionRangeInput({ ...forecast, completionDistribution: null }).bins).toBe(
            undefined,
        );
    });
});
