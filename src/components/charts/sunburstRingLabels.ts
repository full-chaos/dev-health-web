/**
 * How a sunburst ring's labels fit their segments (CHAOS-8510, CHAOS-12820). One rule for every
 * sunburst: the investment page's `InvestmentMixSunburst` and the shared `SunburstChart` (the Ask Dev
 * slot) both read it.
 *
 * A ring label is drawn along its arc at the middle of the ring. A label wider than its own arc is
 * cut with an ellipsis to the arc, and hidden when that leaves less than `MIN_RING_LABEL_PX` (the
 * tooltip, and a legend where there is one, name every segment). So no label crosses into the next
 * segment or the hole: two small segments side by side never print their labels over each other.
 */

/** A label narrower than this is hidden, not cut to a stub. */
export const MIN_RING_LABEL_PX = 28;
/** The room kept free between a label and the ends of its arc. */
const LABEL_ARC_MARGIN_PX = 10;

/**
 * The width, in pixels, a label of a segment may take: the segment's arc length at the middle of
 * the ring, less a margin, never below 0.
 *
 * @param halfSidePx half the shorter side of the chart box (the sunburst's radius at 100%)
 * @param fraction the segment's share of the whole circle, 0 to 1
 * @param innerRadius the ring's inner radius as a fraction of `halfSidePx` (ECharts' `r0`)
 * @param outerRadius the ring's outer radius as a fraction of `halfSidePx` (ECharts' `r`)
 */
export function ringLabelWidth(
    halfSidePx: number,
    fraction: number,
    innerRadius: number,
    outerRadius: number,
): number {
    const middle = (innerRadius + outerRadius) / 2;
    return Math.max(
        0,
        Math.floor(2 * Math.PI * middle * halfSidePx * fraction - LABEL_ARC_MARGIN_PX),
    );
}

/** The ECharts label settings that fit one segment's label to its arc, or hide it. */
export function fittedRingLabel(
    halfSidePx: number,
    fraction: number,
    innerRadius: number,
    outerRadius: number,
) {
    const width = ringLabelWidth(halfSidePx, fraction, innerRadius, outerRadius);
    return {
        rotate: "tangential" as const,
        overflow: "truncate" as const,
        width,
        ...(width < MIN_RING_LABEL_PX ? { show: false } : {}),
    };
}
