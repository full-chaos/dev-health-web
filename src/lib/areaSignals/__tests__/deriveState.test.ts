import { describe, expect, it } from "vitest";

import {
    COVERAGE_THRESHOLDS,
    DELIVERY_RISK_THRESHOLDS,
    FLAKE_THRESHOLDS,
    PIPELINE_SHORTFALL_THRESHOLDS,
    deriveState,
} from "../deriveState";

describe("deriveState — direction-parameterized severity ladder", () => {
    describe("lowerIsBetter (value >= cut is worse)", () => {
        // Flake thresholds: >=15 crit, >=8 high, >=3 med, else low.
        it.each([
            { value: 20, expected: "critical" },
            { value: 15, expected: "critical" }, // boundary is inclusive
            { value: 14.9, expected: "high" },
            { value: 8, expected: "high" },
            { value: 7, expected: "medium" },
            { value: 3, expected: "medium" },
            { value: 2.9, expected: "low" },
            { value: 0, expected: "low" },
        ])("flake $value → $expected", ({ value, expected }) => {
            expect(
                deriveState(value, { thresholds: FLAKE_THRESHOLDS, direction: "lowerIsBetter" }),
            ).toBe(expected);
        });

        it("applies the pipeline ladder to the shortfall (100 - successRate)", () => {
            // success 55 → shortfall 45 → >=40 critical
            expect(
                deriveState(100 - 55, {
                    thresholds: PIPELINE_SHORTFALL_THRESHOLDS,
                    direction: "lowerIsBetter",
                }),
            ).toBe("critical");
            // success 80 → shortfall 20 → >=10 medium (not high, which needs >=25)
            expect(
                deriveState(100 - 80, {
                    thresholds: PIPELINE_SHORTFALL_THRESHOLDS,
                    direction: "lowerIsBetter",
                }),
            ).toBe("medium");
            // success 95 → shortfall 5 → low
            expect(
                deriveState(100 - 95, {
                    thresholds: PIPELINE_SHORTFALL_THRESHOLDS,
                    direction: "lowerIsBetter",
                }),
            ).toBe("low");
        });
    });

    describe("higherIsBetter (value < cut is worse)", () => {
        // Coverage thresholds (target 80): <50 crit, <65 high, <80 med, else low.
        it.each([
            { value: 30, expected: "critical" },
            { value: 49.9, expected: "critical" },
            { value: 50, expected: "high" }, // boundary: not < 50
            { value: 64.9, expected: "high" },
            { value: 65, expected: "medium" },
            { value: 79.9, expected: "medium" },
            { value: 80, expected: "low" },
            { value: 95, expected: "low" },
        ])("coverage $value% → $expected", ({ value, expected }) => {
            expect(
                deriveState(value, {
                    thresholds: COVERAGE_THRESHOLDS,
                    direction: "higherIsBetter",
                }),
            ).toBe(expected);
        });

        // Delivery confidence thresholds: <40 crit, <55 high, <70 med, else low.
        it.each([
            { value: 35, expected: "critical" },
            { value: 50, expected: "high" },
            { value: 68, expected: "medium" },
            { value: 70, expected: "low" },
            { value: 90, expected: "low" },
        ])("release confidence $value% → $expected", ({ value, expected }) => {
            expect(
                deriveState(value, {
                    thresholds: DELIVERY_RISK_THRESHOLDS,
                    direction: "higherIsBetter",
                }),
            ).toBe(expected);
        });
    });

    it("the SAME raw value lands opposite severities under opposite directions", () => {
        // value 10 on a 0-100 scale: tiny under lowerIsBetter, dire under higherIsBetter.
        const lower = deriveState(10, {
            thresholds: COVERAGE_THRESHOLDS,
            direction: "lowerIsBetter",
        });
        const higher = deriveState(10, {
            thresholds: COVERAGE_THRESHOLDS,
            direction: "higherIsBetter",
        });
        expect(lower).toBe("low");
        expect(higher).toBe("critical");
    });
});
