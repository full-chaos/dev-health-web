import { describe, expect, it } from "vitest";

import type { AreaSignal } from "@/lib/areaSignals/types";

import { improveFacts } from "./improveEvidenceFacts";

const sig = (id: string, extra: Partial<AreaSignal> = {}): AreaSignal => ({
    id,
    label: id,
    href: `/${id}`,
    metricLabel: "Metric",
    value: "7",
    state: "high",
    ...extra,
});

describe("improveFacts (CHAOS-8269)", () => {
    it("a failed read is 'Could not be read', not 'Not reported'", () => {
        const [fact] = improveFacts([sig("a", { state: "unavailable", value: "", failed: true })]);
        expect(fact.value).toBe("Could not be read");
    });

    it("an empty read and a served value are unchanged", () => {
        const facts = improveFacts([
            sig("empty", { state: "unavailable", value: "" }),
            sig("served"),
        ]);
        expect(facts[0].value).toBeUndefined();
        expect(facts[1].value).toBe("7 · Metric");
    });
});
