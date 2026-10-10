import { describe, expect, it } from "vitest";

import { COVERAGE_NOTE_TEMPLATE, coverageNote, formatCoveragePercent } from "../coverageNote";

describe("coverageNote (CHAOS-9078)", () => {
    it("names the served coverage as a whole percent", () => {
        expect(coverageNote(0.6)).toBe("Based on 60% of inputs");
        expect(coverageNote(0.2)).toBe("Based on 20% of inputs");
        expect(coverageNote(0.666)).toBe("Based on 67% of inputs");
    });

    it("shows the note at coverage 1 too", () => {
        expect(coverageNote(1)).toBe("Based on 100% of inputs");
    });

    it("has no note when coverage is null, undefined or not a number", () => {
        expect(coverageNote(null)).toBeNull();
        expect(coverageNote(undefined)).toBeNull();
        expect(coverageNote(Number.NaN)).toBeNull();
    });

    it("keeps the text in one template constant", () => {
        expect(COVERAGE_NOTE_TEMPLATE).toBe("Based on {percent}% of inputs");
        expect(formatCoveragePercent(0.6)).toBe(60);
        expect(formatCoveragePercent(null)).toBeNull();
    });
});
