/** A laid-out rectangle. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk), the same algorithm as the approved
 * prototype's `B_squarify` (charts-b.js). Layout math only: each rectangle's area is its value's
 * share of the given rectangle; the values themselves are not changed or shown.
 *
 * `values` must be sorted from large to small; the rectangles come back in the same order.
 * With no positive total (or an empty rectangle) every rectangle is empty.
 */
export function squarify(values: readonly number[], rect: Rect): Rect[] {
    let { x, y, w, h } = rect;
    const total = values.reduce((sum, v) => sum + v, 0);
    if (!(total > 0) || w <= 0 || h <= 0) return values.map(() => ({ x, y, w: 0, h: 0 }));

    const areas = values.map((v) => (v / total) * w * h);
    const out: Rect[] = [];
    let i = 0;
    while (i < areas.length) {
        const short = Math.min(w, h);
        let row: number[] = [];
        let rowSum = 0;
        let worst = Infinity;
        const worstOf = (r: number[], s: number) => {
            const max = Math.max(...r);
            const min = Math.min(...r);
            return Math.max((short * short * max) / (s * s), (s * s) / (short * short * min));
        };
        while (i < areas.length) {
            const next = row.concat(areas[i]);
            const nextSum = rowSum + areas[i];
            const nextWorst = worstOf(next, nextSum);
            if (row.length && nextWorst > worst) break;
            row = next;
            rowSum = nextSum;
            worst = nextWorst;
            i++;
        }
        const thickness = rowSum / short;
        let offset = 0;
        if (w >= h) {
            for (const a of row) {
                const len = a / thickness;
                out.push({ x, y: y + offset, w: thickness, h: len });
                offset += len;
            }
            x += thickness;
            w -= thickness;
        } else {
            for (const a of row) {
                const len = a / thickness;
                out.push({ x: x + offset, y, w: len, h: thickness });
                offset += len;
            }
            y += thickness;
            h -= thickness;
        }
    }
    return out;
}
