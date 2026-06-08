import { describe, expect, it } from "vitest";

import { METRIC_CATALOG } from "@/lib/metrics/catalog";
import { LANDSCAPE_EVIDENCE_METRICS } from "@/lib/metrics/landscape";

describe("LANDSCAPE_EVIDENCE_METRICS", () => {
    const catalogIds = METRIC_CATALOG.map((m) => m.metric as string);

    it("every quadrant maps to a metric id present in METRIC_CATALOG", () => {
        for (const [quadrantType, metric] of Object.entries(LANDSCAPE_EVIDENCE_METRICS)) {
            expect(
                catalogIds.includes(metric),
                `quadrant "${quadrantType}" maps to "${metric}" which is NOT in METRIC_CATALOG`,
            ).toBe(true);
        }
    });

    it("cycle_throughput quadrant links to cycle_time", () => {
        expect(LANDSCAPE_EVIDENCE_METRICS["cycle_throughput"]).toBe("cycle_time");
    });

    it("churn_throughput quadrant links to churn", () => {
        expect(LANDSCAPE_EVIDENCE_METRICS["churn_throughput"]).toBe("churn");
    });
});
