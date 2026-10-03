import { describe, expect, it } from "vitest";

import type { AreaSignal } from "@/lib/areaSignals/types";

import { areaHubFacts } from "./areaHubEvidence";

const sig = (
    id: string,
    cluster: string,
    state: AreaSignal["state"],
    value: string,
): AreaSignal => ({
    id,
    label: id,
    href: `/ai/${id}`,
    cluster,
    metricLabel: `${id} metric`,
    value,
    state,
});

describe("areaHubFacts (CHAOS-8091)", () => {
    const signals = [
        sig("impact", "Signal", "low", "40% AI-assisted"),
        sig("review", "Signal", "high", "2.4× amplification"),
        sig("risk", "Signal", "unavailable", ""),
        sig("auto", "Action", "neutral", "3 opportunities"),
    ];

    it("lists the signals in the order the hub draws them: cluster by cluster, severity inside, no data last", () => {
        expect(areaHubFacts(signals).map((fact) => fact.label)).toEqual([
            "review · review metric",
            "impact · impact metric",
            "risk · risk metric",
            "auto · auto metric",
        ]);
    });

    it("has no hero-first reordering: a critical card in a later group stays after the earlier group", () => {
        const labels = areaHubFacts([
            sig("s", "Signal", "low", "1"),
            sig("a", "Action", "critical", "9"),
        ]).map((fact) => fact.label);
        // The hub emphasises its top card in place; it does not move it to the top.
        expect(labels).toEqual(["s · s metric", "a · a metric"]);
    });

    it("gives the value and state as the card shows them, and no value for a signal with no data", () => {
        const facts = areaHubFacts(signals);
        expect(facts[0].value).toBe("2.4× amplification · High");
        expect(facts[2].value).toBeUndefined();
    });
});
