import { describe, expect, it } from "vitest";

import { CAPACITY_FORECAST_QUERY } from "../queries";

// CHAOS-7977: the capacity page asks for the simulation spread. The text of this query is what
// query-api matches against its registered document (the paired ops change), so it is pinned.
describe("CAPACITY_FORECAST_QUERY", () => {
    it("asks for the completion distribution: the run total, both lists, value and count", () => {
        const compact = CAPACITY_FORECAST_QUERY.replace(/\s+/g, " ");
        // CHAOS-8477: `runs` is the served total the chance curve divides by.
        expect(compact).toContain(
            "completionDistribution { runs days { value count } items { value count } }",
        );
    });

    it("still asks for the three percentiles the distribution is read against", () => {
        for (const field of ["p50Days", "p85Days", "p95Days", "p50Items", "p85Items", "p95Items"]) {
            expect(CAPACITY_FORECAST_QUERY, field).toContain(field);
        }
    });
});
