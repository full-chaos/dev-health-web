import { describe, expect, it } from "vitest";

import { areaHubLayout } from "../hubLayout";
import type { AreaSignal } from "../types";

const sig = (id: string, cluster: string | undefined, state: AreaSignal["state"]): AreaSignal => ({
    id,
    label: id,
    href: `/${id}`,
    cluster,
    metricLabel: id,
    value: state === "unavailable" ? "" : "1",
    state,
});

describe("areaHubLayout", () => {
    it("keeps groups in first-seen order, cards by severity, no data last, and names the one top card", () => {
        const layout = areaHubLayout([
            sig("s-low", "Signal", "low"),
            sig("s-none", "Signal", "unavailable"),
            sig("s-high", "Signal", "high"),
            sig("a-crit", "Action", "critical"),
            sig("a-neutral", "Action", "neutral"),
        ]);
        expect(layout.isClustered).toBe(true);
        expect(layout.clusters.map((group) => group.cluster)).toEqual(["Signal", "Action"]);
        expect(layout.order.map((s) => s.id)).toEqual([
            "s-high",
            "s-low",
            "s-none",
            "a-crit",
            "a-neutral",
        ]);
        // The top card is the most severe one across all groups, drawn in place (not moved up).
        expect(layout.topSignalId).toBe("a-crit");
    });

    it("never makes a neutral or an unavailable card the top signal", () => {
        expect(
            areaHubLayout([sig("n", undefined, "neutral"), sig("u", undefined, "unavailable")])
                .topSignalId,
        ).toBeUndefined();
    });
});
