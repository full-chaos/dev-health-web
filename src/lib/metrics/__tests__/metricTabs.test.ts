import { describe, expect, it } from "vitest";

import { getMetricPolarity, metricInverseGood } from "../catalog";
import { METRIC_TABS } from "../metricTabs";

describe("Metrics page tabs and polarity (CHAOS-7730 guard)", () => {
    it("every metric on every tab has a catalog polarity, so no delta is coloured by a default", () => {
        const metrics = METRIC_TABS.flatMap((tab) => tab.metrics);
        expect(metrics.length).toBeGreaterThan(0);
        for (const metric of metrics) {
            expect(getMetricPolarity(metric), metric).toBeDefined();
        }
    });

    it("lower-is-better metrics are inverse-good; higher-is-better are not", () => {
        for (const metric of [
            "cycle_time",
            "review_latency",
            "wip_saturation",
            "blocked_work",
            "change_failure_rate",
        ]) {
            expect(metricInverseGood(metric), metric).toBe(true);
        }
        for (const metric of ["throughput", "deploy_freq"]) {
            expect(metricInverseGood(metric), metric).toBe(false);
        }
    });
});
