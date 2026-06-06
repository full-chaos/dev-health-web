import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getImproveSignals } from "../improve";

describe("getImproveSignals — Improve taxonomy (CHAOS-2079)", () => {
    it("returns the real Opportunities route as an unavailable summary signal", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        expect(signals).toEqual([
            expect.objectContaining({
                id: "opportunities",
                label: "Opportunities",
                href: "/opportunities",
                state: "unavailable",
                value: "",
            }),
        ]);
    });

    it("returns the same unavailable summary signal in test mode", async () => {
        const signals = await getImproveSignals(defaultMetricFilter, true);
        expect(signals).toHaveLength(1);
        expect(signals[0]).toMatchObject({
            id: "opportunities",
            state: "unavailable",
        });
    });
});
