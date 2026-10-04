import { describe, expect, it } from "vitest";

import { CAPACITY_COMPLETION_DISTRIBUTION_QUERY } from "../queries";

// CHAOS-8598: the text is matched by digest against the ops-registered document, so it is pinned.
describe("CAPACITY_COMPLETION_DISTRIBUTION_QUERY", () => {
    const compact = CAPACITY_COMPLETION_DISTRIBUTION_QUERY.replace(/\s+/g, " ");

    it("selects only the completion distribution bins", () => {
        expect(compact).toContain(
            "capacityForecast(orgId: $orgId, input: {teamId: $teamId, historyDays: $historyDays, simulations: $simulations}) { completionDistribution { days { value count } items { value count } } }",
        );
    });

    it("defaults history to 90 days and simulations to 10000", () => {
        expect(compact).toContain("$historyDays: Int! = 90, $simulations: Int! = 10000");
    });
});
