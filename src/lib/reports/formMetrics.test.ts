import { describe, expect, it } from "vitest";

import { FORM_METRICS, formMetricLabel } from "./formMetrics";

describe("formMetricLabel", () => {
    it("offers only labels that have a report metric", () => {
        expect(FORM_METRICS).toEqual([
            { label: "Deploy Frequency", value: "deployments_count" },
            { label: "Change Failure Rate", value: "change_failure_rate" },
            { label: "CI Success Rate", value: "success_rate" },
        ]);
    });

    it("shows the current label for a stored metric name and for the former Deployment Frequency label", () => {
        expect(formMetricLabel("deployments_count")).toBe("Deploy Frequency");
        expect(formMetricLabel("Deployment Frequency")).toBe("Deploy Frequency");
    });

    it("shows a stored label that is no longer offered as it was saved", () => {
        expect(formMetricLabel("Lead Time")).toBe("Lead Time");
    });
});
