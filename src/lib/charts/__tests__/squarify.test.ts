import { describe, expect, it } from "vitest";

import { squarify } from "../squarify";

const area = (r: { w: number; h: number }) => r.w * r.h;

describe("squarify", () => {
    const rect = { x: 0, y: 0, w: 300, h: 200 };

    it("gives each value its share of the area, in the given order", () => {
        const rects = squarify([6, 3, 1], rect);
        expect(rects).toHaveLength(3);
        const total = 300 * 200;
        expect(area(rects[0]) / total).toBeCloseTo(0.6, 6);
        expect(area(rects[1]) / total).toBeCloseTo(0.3, 6);
        expect(area(rects[2]) / total).toBeCloseTo(0.1, 6);
    });

    it("keeps every rectangle inside the given one, with no overlap of the total area", () => {
        const rects = squarify([5, 4, 3, 2, 1], { x: 10, y: 20, w: 120, h: 90 });
        for (const r of rects) {
            expect(r.x).toBeGreaterThanOrEqual(10 - 1e-9);
            expect(r.y).toBeGreaterThanOrEqual(20 - 1e-9);
            expect(r.x + r.w).toBeLessThanOrEqual(130 + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(110 + 1e-9);
        }
        expect(rects.reduce((s, r) => s + area(r), 0)).toBeCloseTo(120 * 90, 6);
    });

    it("makes near-square cells, not slivers, for equal values", () => {
        const rects = squarify([1, 1, 1, 1], { x: 0, y: 0, w: 200, h: 200 });
        for (const r of rects) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThanOrEqual(1.0001);
    });

    it("returns empty rectangles when there is nothing to lay out", () => {
        expect(squarify([0, 0], rect)).toEqual([
            { x: 0, y: 0, w: 0, h: 0 },
            { x: 0, y: 0, w: 0, h: 0 },
        ]);
        expect(squarify([1], { x: 0, y: 0, w: 0, h: 10 })[0].w).toBe(0);
    });
});
