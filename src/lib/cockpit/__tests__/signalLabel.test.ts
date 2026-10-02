import { describe, expect, it } from "vitest";

import { signalMetricLabel } from "../signalLabel";

const delta = (metric: string, label: string) => ({ metric, label });

describe("signalMetricLabel", () => {
    it("uses the label the API served for the metric in deltas", () => {
        expect(
            signalMetricLabel({ metric: "churn", title: "Code Churn appears up" }, [
                delta("throughput", "Throughput"),
                delta("churn", "Code Churn"),
            ]),
        ).toBe("Code Churn");
    });

    it("keeps the served title unchanged for a signal that is not one of the served deltas", () => {
        const title = "Compounding risk appears high for payments-api";
        const deltas = [delta("churn", "Code Churn")];
        expect(signalMetricLabel({ metric: "compounding_risk", title }, deltas)).toBe(title);
        expect(signalMetricLabel({ metric: "compounding_risk", title })).toBe(title);
    });

    it("makes no name of its own from a metric key or a catalog", () => {
        // `churn` has a catalog label, but the API served no delta for it here.
        expect(signalMetricLabel({ metric: "churn", title: "Code Churn appears up" }, [])).toBe(
            "Code Churn appears up",
        );
        expect(signalMetricLabel({ metric: "risk_entity_score", title: "T" }, [])).not.toMatch(
            /Risk Entity Score/,
        );
    });

    it("ignores an empty served label", () => {
        expect(
            signalMetricLabel({ metric: "churn", title: "Code Churn appears up" }, [
                delta("churn", ""),
            ]),
        ).toBe("Code Churn appears up");
    });
});
