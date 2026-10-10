import { describe, expect, it } from "vitest";

import { getMetricPolarity } from "../catalog";
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
            expect(getMetricPolarity(metric), metric).toBe("lowerIsBetter");
        }
        for (const metric of ["throughput", "deploy_freq"]) {
            expect(getMetricPolarity(metric), metric).toBe("higherIsBetter");
        }
    });

    it("has the approved prototype tile sets, in the prototype order (4 / 4 / 3)", () => {
        const sets = Object.fromEntries(METRIC_TABS.map((tab) => [tab.id, tab.metrics]));
        expect(sets).toEqual({
            dora: ["deploy_freq", "cycle_time", "review_latency", "change_failure_rate"],
            flow: ["cycle_time", "review_latency", "wip_saturation", "blocked_work"],
            throughput: ["throughput", "wip_saturation", "blocked_work"],
        });
    });

    it("has one subtitle per tab and quadrant titles without the word 'landscape'", () => {
        const byId = Object.fromEntries(METRIC_TABS.map((tab) => [tab.id, tab]));
        expect(byId.dora.description).toBe("Release speed and stability.");
        expect(byId.flow.description).toBe("From idea to merge.");
        expect(byId.throughput.description).toBe("Delivery volume and pacing.");
        expect(METRIC_TABS.map((tab) => tab.quadrant.title)).toEqual([
            "Churn × Throughput",
            "Cycle Time × Throughput",
            "WIP × Throughput",
        ]);
    });

    it("keeps each tab's quadrant type and highlight metric (data logic unchanged)", () => {
        expect(METRIC_TABS.map((tab) => [tab.id, tab.quadrant.type, tab.highlight])).toEqual([
            ["dora", "churn_throughput", "deploy_freq"],
            ["flow", "cycle_throughput", "cycle_time"],
            ["throughput", "wip_throughput", "throughput"],
        ]);
    });
});
