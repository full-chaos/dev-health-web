import { describe, expect, it } from "vitest";

import type { AreaSignal } from "@/lib/areaSignals/types";

import { governEvidenceFacts } from "./governEvidenceFacts";

const sig = (id: string, extra: Partial<AreaSignal> = {}): AreaSignal => ({
    id,
    label: id,
    href: `/${id}`,
    metricLabel: "Metric",
    value: "7",
    state: "high",
    ...extra,
});

describe("governEvidenceFacts (CHAOS-8269)", () => {
    it("a failed read is 'Could not be read', not 'Not reported'", () => {
        const [fact] = governEvidenceFacts([
            sig("a", { state: "unavailable", value: "", failed: true }),
        ]);
        expect(fact.value).toBe("Could not be read");
    });

    it("an empty read and a served value are unchanged", () => {
        const facts = governEvidenceFacts([
            sig("empty", { state: "unavailable", value: "" }),
            sig("served"),
        ]);
        // The body order puts a served card before an empty one: read by label, not by index.
        const byLabel = Object.fromEntries(facts.map((f) => [f.label, f.value]));
        expect(byLabel["empty — Metric"]).toBeUndefined();
        expect(byLabel["served — Metric"]).toBe("7");
    });
});
