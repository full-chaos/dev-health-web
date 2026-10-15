import { describe, expect, it } from "vitest";
import { readFlowSizing, readSizingCoverage } from "./coverage";
import type { SankeyResponse } from "@/lib/types";

describe("readSizingCoverage (CHAOS-9809)", () => {
    it("null, undefined and NaN are not measured", () => {
        for (const v of [null, undefined, Number.NaN]) {
            expect(readSizingCoverage(v, 3)).toEqual({ state: "not-measured" });
        }
    });

    it("below half is mostly count, a produced 0 included", () => {
        expect(readSizingCoverage(0, 5)).toMatchObject({ state: "measured", mostlyCount: true });
        expect(readSizingCoverage(0.49, null)).toMatchObject({ mostlyCount: true, unsized: null });
        expect(readSizingCoverage(0.5, 1)).toMatchObject({ mostlyCount: false, unsized: 1 });
    });

    it("takes the first flow that carries a sizing coverage", () => {
        const flow = (sizing?: number): SankeyResponse => ({
            mode: "investment",
            nodes: [],
            links: [],
            coverage: sizing === undefined ? {} : { sizing },
        });
        expect(readFlowSizing(null, flow(), flow(0.3))).toMatchObject({ coverage: 0.3 });
        expect(readFlowSizing(flow(), undefined)).toEqual({ state: "not-measured" });
    });
});
