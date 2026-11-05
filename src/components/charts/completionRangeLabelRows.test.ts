import { describe, expect, it } from "vitest";

import {
    DAY_LABEL_CHAR_WIDTH,
    DAY_LABEL_GAP,
    dayAxisStep,
    LABEL_CHAR_WIDTH,
    LABEL_GAP,
    type LabelBox,
    labelRows,
    labelWidth,
} from "./completionRangeLabelRows";

// CHAOS-8614: the percentile labels of the "Completion range" chart. Labels with room share the
// row next to the plot (row 0), as the prototype draws them. Labels that would touch go to
// different rows: two percentiles on one day must not print on top of each other.

const box = (x: number, width = 100, align: LabelBox["align"] = "center"): LabelBox => ({
    x,
    width,
    align,
});

describe("labelRows", () => {
    it("gives no row when there is no label", () => {
        expect(labelRows([])).toEqual([]);
    });

    it("puts labels with room in the row next to the plot", () => {
        expect(labelRows([box(100), box(300), box(500)])).toEqual([0, 0, 0]);
    });

    it("puts labels on the same line in different rows: they never share a row", () => {
        expect(labelRows([box(300), box(300)])).toEqual([0, 1]);
        expect(labelRows([box(300), box(300), box(300)])).toEqual([0, 1, 2]);
    });

    it("puts labels that overlap in part in different rows", () => {
        // [250, 350] and [330, 430]
        expect(labelRows([box(300), box(380)])).toEqual([0, 1]);
    });

    it("keeps the gap on the right of a placed label: one pixel less than the gap is too close", () => {
        // The first label ends at 350. The second starts at 350 + gap: it has room.
        expect(labelRows([box(300), box(400 + LABEL_GAP)])).toEqual([0, 0]);
        expect(labelRows([box(300), box(400 + LABEL_GAP - 1)])).toEqual([0, 1]);
    });

    it("keeps the gap on the left of a placed label: a label before it has room or not by the same rule", () => {
        // The first label starts at 450. A label that ends at 450 - gap has room.
        expect(labelRows([box(500), box(400 - LABEL_GAP)])).toEqual([0, 0]);
        expect(labelRows([box(500), box(400 - LABEL_GAP + 1)])).toEqual([0, 1]);
        // far before it: the same row
        expect(labelRows([box(500), box(100)])).toEqual([0, 0]);
    });

    it("measures a right-aligned label from its line to the left", () => {
        // Centred at 440 the label is [390, 490]: room beside [250, 350].
        expect(labelRows([box(300), box(440)])).toEqual([0, 0]);
        // Right-aligned at 440 it is [340, 440]: it touches [250, 350].
        expect(labelRows([box(300), box(440, 100, "right")])).toEqual([0, 1]);
        // Right-aligned and far to the right it has room: [362, 462] starts at the gap.
        expect(labelRows([box(300), box(450 + LABEL_GAP, 100, "right")])).toEqual([0, 0]);
    });

    it("takes the lowest row with room, not a new row", () => {
        // The third label has room in row 0 beside the first.
        expect(labelRows([box(300), box(300), box(600)])).toEqual([0, 1, 0]);
        // The third label touches the label of row 0 and the label of row 1: a third row.
        expect(labelRows([box(300), box(300), box(330)])).toEqual([0, 1, 2]);
        // The third label touches the wide label of row 0, but has room beside the narrow label
        // of row 1: it goes to row 1.
        expect(labelRows([box(300, 200), box(300, 20), box(380, 100)])).toEqual([0, 1, 1]);
    });
});

describe("labelWidth", () => {
    it("is the width of the longest line", () => {
        expect(labelWidth(["P50 · Sep 14", "Optimistic · 4 days"])).toBe(
            "Optimistic · 4 days".length * LABEL_CHAR_WIDTH,
        );
        expect(labelWidth(["P95 · Jan 31, 2027", "Target"])).toBe(
            "P95 · Jan 31, 2027".length * LABEL_CHAR_WIDTH,
        );
    });

    it("is zero for no line", () => {
        expect(labelWidth([])).toBe(0);
    });
});

// CHAOS-12707: the day axis runs to the horizon bin (day 365). At phone width ECharts' own ticks
// printed the dates on each other, so the chart labels every `dayAxisStep` days.
describe("dayAxisStep", () => {
    // The dates the figure prints: a short date in the forecast's year, the year after it.
    const start = Date.UTC(2026, 10, 2);
    const dayLabel = (day: number) => {
        const date = new Date(start + day * 86_400_000);
        const text = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
        });
        return date.getUTCFullYear() === 2026 ? text : `${text}, ${date.getUTCFullYear()}`;
    };
    const AXIS_MAX = 365 + 18;

    /** The labelled days, and whether each keeps the gap to the next at the widest label. */
    function spacing(step: number, plotWidth: number) {
        const days: number[] = [];
        for (let day = 0; day <= AXIS_MAX; day += step) days.push(day);
        const widest = Math.max(...days.map((day) => dayLabel(day).length * DAY_LABEL_CHAR_WIDTH));
        return { days, room: (step / AXIS_MAX) * plotWidth, need: widest + DAY_LABEL_GAP };
    }

    it.each([180, 230, 270, 310, 600, 1000])(
        "keeps every label clear of the next at a plot %i px wide",
        (plotWidth) => {
            const step = dayAxisStep(AXIS_MAX, plotWidth, dayLabel);
            const { days, room, need } = spacing(step, plotWidth);
            expect(days.length).toBeGreaterThanOrEqual(2);
            expect(room).toBeGreaterThanOrEqual(need);
        },
    );

    it("takes the smallest step that fits, so a wide chart keeps more dates", () => {
        const narrow = dayAxisStep(AXIS_MAX, 270, dayLabel);
        const wide = dayAxisStep(AXIS_MAX, 1000, dayLabel);
        expect(wide).toBeLessThan(narrow);
        // The step below the one chosen would not fit.
        const steps = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, 730, 1095];
        const below = steps[steps.indexOf(narrow) - 1]!;
        const { room, need } = spacing(below, 270);
        expect(room).toBeLessThan(need);
    });

    it("labels only day 0 when nothing fits, and never divides by an empty axis", () => {
        // A step past the axis end labels day 0 alone.
        expect(dayAxisStep(AXIS_MAX, 20, dayLabel)).toBeGreaterThan(AXIS_MAX);
        expect(dayAxisStep(0, 300, dayLabel)).toBe(1095);
        expect(dayAxisStep(AXIS_MAX, 0, dayLabel)).toBe(1095);
    });
});
