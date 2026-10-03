import { describe, expect, it } from "vitest";

import { markFailedSignals } from "../failedRead";
import type { AreaSignal } from "../types";

const sig = (id: string, state: AreaSignal["state"]): AreaSignal => ({
    id,
    label: id,
    href: `/${id}`,
    metricLabel: id,
    value: state === "unavailable" ? "" : "1",
    state,
});

describe("markFailedSignals (CHAOS-8269)", () => {
    const sources = { a: ["x"], b: ["x", "y"], c: ["z"] };

    it("marks an unavailable card whose read failed, and only that", () => {
        const out = markFailedSignals(
            [sig("a", "unavailable"), sig("b", "unavailable"), sig("c", "unavailable")],
            sources,
            new Set(["y"]),
        );
        expect(out.map((s) => s.failed)).toEqual([undefined, true, undefined]);
    });

    it("never touches a card that has a value", () => {
        const out = markFailedSignals([sig("a", "high")], sources, new Set(["x"]));
        expect(out[0].failed).toBeUndefined();
    });

    it("leaves a card with no mapped source alone", () => {
        const out = markFailedSignals([sig("q", "unavailable")], sources, new Set(["x"]));
        expect(out[0].failed).toBeUndefined();
    });
});
