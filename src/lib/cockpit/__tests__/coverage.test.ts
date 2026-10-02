import { describe, expect, it } from "vitest";

import { formatCoveragePct } from "../coverage";

describe("formatCoveragePct", () => {
    it("shows the served coverage as a whole percent", () => {
        expect(formatCoveragePct(92)).toBe("92%");
        expect(formatCoveragePct(41.6)).toBe("42%");
        expect(formatCoveragePct(0)).toBe("0%");
    });

    it("clamps an out-of-range value to 0–100", () => {
        expect(formatCoveragePct(140)).toBe("100%");
        expect(formatCoveragePct(-3)).toBe("0%");
    });

    it("gives no value when the API served none (the row then reads Not reported)", () => {
        expect(formatCoveragePct(null)).toBeUndefined();
        expect(formatCoveragePct(undefined)).toBeUndefined();
        expect(formatCoveragePct(Number.NaN)).toBeUndefined();
    });
});
