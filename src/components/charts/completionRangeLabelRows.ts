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
