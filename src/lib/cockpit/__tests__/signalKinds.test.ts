import { describe, expect, it } from "vitest";

import { RISK_SIGNAL_METRIC, isMetricSignal, isRiskSignal } from "../signalKinds";

const deltas = [{ metric: "churn" }, { metric: "throughput" }];

describe("signal kinds, from served fields", () => {
    it("a metric signal is one whose served metric key is one of the served deltas", () => {
        expect(isMetricSignal({ metric: "churn" }, deltas)).toBe(true);
        expect(isMetricSignal({ metric: "throughput" }, deltas)).toBe(true);
        expect(isMetricSignal({ metric: "cycle_time" }, deltas)).toBe(false);
    });

    it("a risk signal and a recommendation signal are not metric signals", () => {
        expect(isMetricSignal({ metric: RISK_SIGNAL_METRIC }, deltas)).toBe(false);
        expect(isMetricSignal({ metric: "rule-review-rotation" }, deltas)).toBe(false);
    });

    it("no signal is a metric signal when the API served no delta", () => {
        expect(isMetricSignal({ metric: "churn" }, [])).toBe(false);
        expect(isMetricSignal({ metric: "churn" })).toBe(false);
    });

    it("a risk signal is one whose served metric key is the risk key, whatever its title", () => {
        expect(isRiskSignal({ metric: "compounding_risk" })).toBe(true);
        expect(isRiskSignal({ metric: "churn" })).toBe(false);
        // The kind does not come from the title: this object has no title at all.
        expect(isRiskSignal({ metric: "compounding_risk_v2" })).toBe(false);
    });
});
