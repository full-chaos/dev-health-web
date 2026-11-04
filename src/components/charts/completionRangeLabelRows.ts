/**
 * Where the percentile labels of the "Completion range" chart sit above the plot (CHAOS-8614).
 *
 * Layout only: no value of the forecast is read or made here. A label is a box above its marker
 * line. Labels that would touch go to different rows; labels with room share the row next to the
 * plot, as the approved prototype draws them.
 */

/** One label as the chart will draw it: the pixel of its line, its width, and how it is aligned. */
export type LabelBox = { x: number; width: number; align: "center" | "right" };

/** A safe width for one character of the 11px label text: a little more than the real glyph. */
export const LABEL_CHAR_WIDTH = 6.6;
/** The least free space between two labels of one row. */
export const LABEL_GAP = 12;

/** The width of a label: its longest line. */
export function labelWidth(lines: string[]): number {
    return Math.max(0, ...lines.map((line) => line.length)) * LABEL_CHAR_WIDTH;
}

/**
 * The row of each label, in the order given. Row 0 is the row next to the plot. A label takes the
 * lowest row in which it keeps `LABEL_GAP` to every label already there, so two labels on the
 * same day never print on top of each other.
 */
export function labelRows(boxes: LabelBox[]): number[] {
    const placed: Array<Array<[number, number]>> = [];
    return boxes.map((box) => {
        const left = box.align === "right" ? box.x - box.width : box.x - box.width / 2;
        const right = left + box.width;
        let row = 0;
        while (
            (placed[row] ?? []).some(
                ([from, to]) => left < to + LABEL_GAP && from < right + LABEL_GAP,
            )
        ) {
            row += 1;
        }
        (placed[row] ??= []).push([left, right]);
        return row;
    });
}

/**
 * A safe width for one character of the 10px day-axis text: a little more than the real glyph
 * (CHAOS-12707). "Feb 10, 2027" measures about 59 px in the browser, 4.9 px a character.
 */
export const DAY_LABEL_CHAR_WIDTH = 6;
/** The least free space between two day labels on the axis. */
export const DAY_LABEL_GAP = 8;
/** The day steps the axis may label at, smallest first: days, weeks, months, quarters, years. */
const DAY_STEPS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, 730, 1095];

/**
 * The step, in days, between two labels of the day axis (CHAOS-12707). Layout only: no value of
 * the forecast is read or made here, and every point stays on the chart. The step is the smallest
 * of `DAY_STEPS` at which each labelled day (0, step, 2 × step, ... up to `axisMax`) keeps
 * `DAY_LABEL_GAP` to the next at the widest of their labels. A day axis that runs to the horizon
 * bin (day 365) on a phone thus gets a few far-apart dates, never dates printed on each other.
 * When no step fits, the largest is used: then only day 0 is labelled.
 */
export function dayAxisStep(
    axisMax: number,
    plotWidth: number,
    dayLabel: (day: number) => string,
): number {
    if (!(axisMax > 0) || !(plotWidth > 0)) return DAY_STEPS.at(-1)!;
    for (const step of DAY_STEPS) {
        let widest = 0;
        for (let day = 0; day <= axisMax; day += step) {
            widest = Math.max(widest, dayLabel(day).length * DAY_LABEL_CHAR_WIDTH);
        }
        if ((step / axisMax) * plotWidth >= widest + DAY_LABEL_GAP) return step;
    }
    return DAY_STEPS.at(-1)!;
}
