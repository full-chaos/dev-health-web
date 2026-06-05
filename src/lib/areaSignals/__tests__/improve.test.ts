import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getImproveSignals } from "../improve";

// Improve's locked taxonomy (CHAOS-2079) is Opportunities / Experiments /
// Automations. Capacity Planning moved to Plan and AI Workflows became the
// first-class AI area, so neither is an Improve sub-area any more. The
// resolver-backed Improve hub signal cards are J5 scope, so until then the
// resolver returns no cards (honest empty — never a fabricated card).
describe("getImproveSignals — Improve taxonomy (CHAOS-2079)", () => {
    it("returns no signal cards (Improve hub resolvers are J5 scope)", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        expect(signals).toEqual([]);
    });

    it("returns no signal cards in test mode", async () => {
        const signals = await getImproveSignals(defaultMetricFilter, true);
        expect(signals).toEqual([]);
    });
});
