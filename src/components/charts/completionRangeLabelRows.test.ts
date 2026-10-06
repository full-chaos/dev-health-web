import { describe, expect, it } from "vitest";

import {
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
