// CHAOS-9077: getMetricPolarity is the one source of a metric's polarity.
import { describe, it, expect } from "vitest";
import { getMetricPolarity } from "../catalog";

describe("getMetricPolarity", () => {
    it("is lowerIsBetter for metrics where a fall is good", () => {
        for (const key of ["pr_rework_ratio", "change_failure_rate", "blocked_work"]) {
            expect(getMetricPolarity(key)).toBe("lowerIsBetter");
        }
    });

    it("is higherIsBetter for ci_success", () => {
        expect(getMetricPolarity("ci_success")).toBe("higherIsBetter");
    });

    it("is undefined for an unknown or empty key", () => {
        expect(getMetricPolarity("not_in_the_catalog")).toBeUndefined();
        expect(getMetricPolarity("")).toBeUndefined();
    });
});
