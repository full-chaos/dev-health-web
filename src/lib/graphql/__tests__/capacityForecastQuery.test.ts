import { describe, expect, it } from "vitest";

import { CAPACITY_FORECAST_QUERY } from "../queries";

// CHAOS-7977: the capacity page asks for the simulation spread. The text of this query is what
// query-api matches against its registered document (the paired ops change), so it is pinned.
describe("CAPACITY_FORECAST_QUERY", () => {
    it("asks for the completion distribution: the run total and, per bin, value, count and served share", () => {
        const compact = CAPACITY_FORECAST_QUERY.replace(/\s+/g, " ");
        // CHAOS-8477: `cumulativeShare` is the served point of the chance curve; `runs` is the
        // served run total. The web adds up neither. CHAOS-8532: `unfinishedRuns` and
        // `horizonDays` are the served count of the runs that did not finish and the served
        // horizon of the simulation.
        expect(compact).toContain(
            "completionDistribution { runs unfinishedRuns horizonDays days { value count cumulativeShare } items { value count cumulativeShare } }",
        );
    });

    it("still asks for the three percentiles the distribution is read against", () => {
        for (const field of ["p50Days", "p85Days", "p95Days", "p50Items", "p85Items", "p95Items"]) {
            expect(CAPACITY_FORECAST_QUERY, field).toContain(field);
        }
    });
});
