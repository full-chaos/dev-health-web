import { describe, expect, it } from "vitest";

import { getAreaById } from "@/lib/navigation/areas";

import { areaClusterOrder, areaOverviewLayout } from "../overviewLayout";
import type { AreaSignal, AreaSignalState } from "../types";

const signal = (id: string, state: AreaSignalState, cluster?: string): AreaSignal => ({
    id,
    label: id,
    href: `/${id}`,
    metricLabel: `${id} metric`,
    value: state === "unavailable" ? "" : "1",
    state,
    cluster,
});

describe("areaClusterOrder", () => {
    it("is the order of the groups of the area's hub items, each once", () => {
        const govern = getAreaById("govern");
        expect(govern).toBeDefined();
        expect(areaClusterOrder(govern!)).toEqual(["Quality", "Risk"]);
        expect(areaClusterOrder({ hubItems: [] })).toEqual([]);
    });
});

describe("areaOverviewLayout (the one layout rule of an area overview)", () => {
    it("groups follow the given order, not first-seen order; cards by severity inside; no data last", () => {
        const layout = areaOverviewLayout(
            [
                signal("r-low", "low", "Risk"),
                signal("q-none", "unavailable", "Quality"),
                signal("q-high", "high", "Quality"),
                signal("r-crit", "critical", "Risk"),
                signal("hero", "critical", "Risk"),
            ],
            ["Quality", "Risk"],
        );
        expect(layout.hero?.id).toBe("r-crit");
        expect(layout.isClustered).toBe(true);
        expect(layout.clusters.map((group) => group.cluster)).toEqual(["Quality", "Risk"]);
        expect(layout.bodyOrder.map((s) => s.id)).toEqual([
            "r-crit",
            "q-high",
            "q-none",
            "hero",
            "r-low",
        ]);
    });

    it("a flat area keeps severity order with the no-data cards last; with no data at all there is no hero", () => {
        const flat = areaOverviewLayout(
            [signal("a", "unavailable"), signal("b", "low"), signal("c", "high")],
            [],
        );
        expect(flat.isClustered).toBe(false);
        expect(flat.bodyOrder.map((s) => s.id)).toEqual(["c", "b", "a"]);
        const none = areaOverviewLayout([signal("a", "unavailable")], []);
        expect(none.hero).toBeUndefined();
        expect(none.bodyOrder.map((s) => s.id)).toEqual(["a"]);
    });
});
