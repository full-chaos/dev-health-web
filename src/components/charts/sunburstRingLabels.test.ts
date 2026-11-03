import { describe, expect, it } from "vitest";

import { MIN_RING_LABEL_PX, fittedRingLabel, ringLabelWidth } from "./sunburstRingLabels";

// CHAOS-12820: the one sunburst ring-label rule, for the investment page and the shared chart.
describe("sunburstRingLabels", () => {
    it("gives a label its segment's arc at the middle of the ring, less a margin", () => {
        // Ring 15%..40% of a 180 px half side; a quarter of the circle.
        expect(ringLabelWidth(180, 0.25, 0.15, 0.4)).toBe(
            Math.floor(2 * Math.PI * 0.275 * 180 * 0.25 - 10),
        );
    });

    it("never gives a negative width", () => {
        expect(ringLabelWidth(180, 0, 0.15, 0.4)).toBe(0);
    });

    it("cuts a label to its arc and turns it along the ring", () => {
        const label = fittedRingLabel(180, 0.4, 0.15, 0.4);
        expect(label).toMatchObject({ rotate: "tangential", overflow: "truncate" });
        expect(label.width).toBe(ringLabelWidth(180, 0.4, 0.15, 0.4));
        expect(label).not.toHaveProperty("show");
    });

    it("hides a label whose arc is narrower than the least readable width", () => {
        // 5% of a 180 px half side at the middle of 15%..40% leaves under 28 px.
        const width = ringLabelWidth(180, 0.05, 0.15, 0.4);
        expect(width).toBeLessThan(MIN_RING_LABEL_PX);
        expect(fittedRingLabel(180, 0.05, 0.15, 0.4)).toMatchObject({ show: false });
    });
});
