import { describe, expect, it } from "vitest";

import { hasPlottableData, plottablePoints } from "@/lib/quadrantPoints";
import type { QuadrantPoint } from "@/lib/types";

const base = {
    entity_id: "t",
    entity_label: "T",
    window_start: "a",
    window_end: "b",
    evidence_link: "/x",
} as const;
const mk = (o: Record<string, unknown>) =>
    ({ ...base, x: 1, y: 2, ...o }) as unknown as QuadrantPoint;

describe("plottablePoints", () => {
    it("drops no_data=true and null coordinates, never turning null into 0", () => {
        const pts = [
            mk({ no_data: false }),
            mk({ no_data: true, x: null, y: null }),
            mk({ x: null, y: null }),
            mk({}),
        ];
        expect(plottablePoints(pts)).toHaveLength(2);
        expect(hasPlottableData(pts[2])).toBe(false);
    });
    it("handles undefined", () => {
        expect(plottablePoints(undefined)).toEqual([]);
    });
});
