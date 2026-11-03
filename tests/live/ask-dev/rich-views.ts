/**
 * CHAOS-11946 (I-50): compares what a rich view DRAWS with what ACR SERVED.
 *
 * The served side is the answer's own `render_shapes`, read from the investigation stream
 * (`watchResults`). The drawn side is the view's value table: every chart carries one (ask-dev's
 * `ShapeDataTable`), and its cells print each served value exactly (`String(value)`), so the
 * comparison is a string comparison and needs no tolerance. A point ACR did not serve is a gap
 * ("—"), never a zero (check 12).
 *
 * Pure TypeScript with no Playwright import, so `__tests__/rich-views.test.ts` can plant mismatches
 * and prove each one is reported.
 */

export type ServedPoint = {
    label: string;
    value: number;
    source?: { subject_canonical_id?: string };
};

export type ServedSeries = { key: string; label: string; points: ServedPoint[] };

export type ServedShape = {
    shape_id: string;
    kind: string;
    selected_by: string;
    title: string;
    series: ServedSeries[];
};

export type DrawnRow = { label: string; cells: string[] };

/** The gap mark a value table prints where ACR served no point. */
export const GAP = "—";

/** The shapes the answer served, in served order. No `render_shapes` is none, never an error. */
export function servedShapes(result: unknown): ServedShape[] {
    const shapes = (result as { render_shapes?: unknown } | null | undefined)?.render_shapes;
    return Array.isArray(shapes) ? (shapes as ServedShape[]) : [];
}

/**
 * The rows a faithful value table holds for `shape`: one per label, in the order ACR served them
 * (the union of the series' labels, first seen first); for a cohort, by each member's served
 * attention rank, a label with no rank after the ranked ones.
 */
export function expectedRows(shape: ServedShape, ranks?: ReadonlyMap<string, number>): DrawnRow[] {
    const rankOf = new Map<string, number>();
    for (const series of shape.series) {
        for (const point of series.points) {
            if (rankOf.has(point.label)) continue;
            const rank = ranks?.get(point.source?.subject_canonical_id ?? "");
            rankOf.set(point.label, rank ?? Number.MAX_SAFE_INTEGER);
        }
    }
    // A stable sort: equal ranks (and a non-cohort shape, where all are equal) keep served order.
    const labels = [...rankOf.keys()].sort((left, right) => rankOf.get(left)! - rankOf.get(right)!);
    return labels.map((label) => ({
        label,
        cells: shape.series.map((series) => {
            const point = series.points.find((candidate) => candidate.label === label);
            return point === undefined ? GAP : String(point.value);
        }),
    }));
}

/**
 * Every way the drawn table differs from the served shape, as plain sentences; empty when the
 * table states every served point exactly, in served order, and nothing else.
 */
export function tableMismatches(
    shape: ServedShape,
    drawn: readonly DrawnRow[],
    ranks?: ReadonlyMap<string, number>,
): string[] {
    const expected = expectedRows(shape, ranks);
    const drawnLabels = drawn.map((row) => row.label);
    const servedLabels = expected.map((row) => row.label);
    if (drawnLabels.join("\u0000") !== servedLabels.join("\u0000")) {
        return [`rows drawn [${drawnLabels.join(", ")}], served [${servedLabels.join(", ")}]`];
    }
    const mismatches: string[] = [];
    expected.forEach((row, rowIndex) => {
        const cells = drawn[rowIndex]!.cells;
        if (cells.length !== row.cells.length) {
            mismatches.push(
                `row "${row.label}": ${String(cells.length)} cells drawn, ${String(row.cells.length)} series served`,
            );
            return;
        }
        row.cells.forEach((served, seriesIndex) => {
            const cell = cells[seriesIndex]!;
            if (cell !== served) {
                mismatches.push(
                    `row "${row.label}", series "${shape.series[seriesIndex]!.label}": drawn "${cell}", served "${served}"`,
                );
            }
        });
    });
    return mismatches;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Whether dated marks sit in proportion to elapsed time (a time axis), within `tolerance` of the
 * axis span. A measurement this cannot make (fewer than two marks, a label that is not a date, no
 * span) is reported, never passed.
 */
export function elapsedTimeMismatches(
    marks: ReadonlyArray<{ label: string; x: number }>,
    tolerance = 0.02,
): string[] {
    if (marks.length < 2) return ["fewer than two dated marks: elapsed time cannot be checked"];
    const notDates = marks.filter(
        (mark) => !ISO_DAY.test(mark.label) || Number.isNaN(Date.parse(mark.label)),
    );
    if (notDates.length > 0) return notDates.map((mark) => `mark "${mark.label}" is not a date`);
    const times = marks.map((mark) => Date.parse(mark.label));
    const first = 0;
    const last = marks.length - 1;
    const timeSpan = times[last]! - times[first]!;
    const xSpan = marks[last]!.x - marks[first]!.x;
    if (timeSpan <= 0 || xSpan <= 0)
        return ["the marks span no time or no width: elapsed time cannot be checked"];
    const mismatches: string[] = [];
    marks.forEach((mark, index) => {
        const drawn = (mark.x - marks[first]!.x) / xSpan;
        const elapsed = (times[index]! - times[first]!) / timeSpan;
        if (Math.abs(drawn - elapsed) > tolerance) {
            mismatches.push(
                `mark "${mark.label}" at ${drawn.toFixed(3)} of the axis, elapsed time puts it at ${elapsed.toFixed(3)}`,
            );
        }
    });
    return mismatches;
}
