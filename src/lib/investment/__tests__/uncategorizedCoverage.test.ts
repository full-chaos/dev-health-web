import { describe, expect, it } from "vitest";
import { readUncategorizedCoverage } from "../coverage";

describe("readUncategorizedCoverage", () => {
    it("a count the API did not produce is not measured, never zero", () => {
        for (const count of [null, undefined, Number.NaN]) {
            expect(readUncategorizedCoverage(count, 10)).toEqual({ state: "not-measured" });
        }
    });

    it("a window with no unit, or an impossible count, is not measured", () => {
        expect(readUncategorizedCoverage(0, 0)).toEqual({ state: "not-measured" });
        expect(readUncategorizedCoverage(0, null)).toEqual({ state: "not-measured" });
        expect(readUncategorizedCoverage(5, 4)).toEqual({ state: "not-measured" });
    });

    it("a produced 0 with units in the window means none are left out", () => {
        expect(readUncategorizedCoverage(0, 10)).toEqual({ state: "none" });
    });

    it("a produced count reads as N of M with its share", () => {
        expect(readUncategorizedCoverage(4, 10)).toEqual({
            state: "partial",
            count: 4,
            total: 10,
            share: 0.4,
        });
        expect(readUncategorizedCoverage(10, 10)).toMatchObject({ state: "partial", share: 1 });
    });
});
