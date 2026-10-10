import { describe, expect, it } from "vitest";

import { explainAnswerIsForOtherMetric, isExplainClientError } from "./explainAnswer";

describe("explainAnswerIsForOtherMetric (CHAOS-9137)", () => {
    it("is true for the cycle_time fallback answer to a metric it does not serve", () => {
        expect(
            explainAnswerIsForOtherMetric("pr_rework_ratio", {
                metric: "pr_rework_ratio",
                label: "Cycle Time",
            }),
        ).toBe(true);
    });

    it("is true when the answer names a different metric", () => {
        expect(
            explainAnswerIsForOtherMetric("churn", { metric: "cycle_time", label: "Code Churn" }),
        ).toBe(true);
    });

    it("is false for the requested metric's own label", () => {
        expect(
            explainAnswerIsForOtherMetric("cycle_time", {
                metric: "cycle_time",
                label: "Cycle Time",
            }),
        ).toBe(false);
    });

    it("is false for a served label that is no catalog label (a producer's own name)", () => {
        expect(
            explainAnswerIsForOtherMetric("cycle_time", {
                metric: "cycle_time",
                label: "Lead Time To Merge",
            }),
        ).toBe(false);
    });
});

describe("isExplainClientError", () => {
    it.each(["API error: 400", "API error: 404", "API error: 422"])("is true for %s", (message) => {
        expect(isExplainClientError(new Error(message))).toBe(true);
    });
    it.each(["API error: 401", "API error: 403", "API error: 429", "API error: 500", "boom"])(
        "is false for %s",
        (message) => {
            expect(isExplainClientError(new Error(message))).toBe(false);
        },
    );
    it("is false for a non-error", () => {
        expect(isExplainClientError("API error: 400")).toBe(false);
    });
});
