import { describe, expect, it } from "vitest";
import { sortDeltasByRole, METRIC_CATEGORY_MAP } from "@/lib/metrics/catalog";
import { ROLE_CONFIGS } from "@/lib/roleContext";
import type { MetricDelta } from "@/lib/types";

const makeDelta = (metric: string, delta_pct = 0): MetricDelta => ({
    metric,
    label: metric,
    value: 10,
    unit: "items",
    delta_pct,
    spark: [],
});

describe("METRIC_CATEGORY_MAP", () => {
    it("maps review metrics to 'review'", () => {
        expect(METRIC_CATEGORY_MAP["review_latency"]).toBe("review");
        expect(METRIC_CATEGORY_MAP["review_load"]).toBe("review");
    });

    it("maps cycle/delivery metrics to 'cycle'", () => {
        expect(METRIC_CATEGORY_MAP["cycle_time"]).toBe("cycle");
        expect(METRIC_CATEGORY_MAP["throughput"]).toBe("cycle");
        expect(METRIC_CATEGORY_MAP["deploy_freq"]).toBe("cycle");
    });

    it("maps churn/rework metrics to 'churn'", () => {
        expect(METRIC_CATEGORY_MAP["churn"]).toBe("churn");
        expect(METRIC_CATEGORY_MAP["rework_ratio"]).toBe("churn");
        expect(METRIC_CATEGORY_MAP["pr_rework_ratio"]).toBe("churn");
    });

    it("maps wip metrics to 'wip'", () => {
        expect(METRIC_CATEGORY_MAP["wip"]).toBe("wip");
        expect(METRIC_CATEGORY_MAP["wip_saturation"]).toBe("wip");
        expect(METRIC_CATEGORY_MAP["blocked_work"]).toBe("wip");
    });

    it("every METRIC_CATEGORY_MAP value is a word present in at least one ROLE_CONFIGS investigationOrder", () => {
        // Guards against vocabulary drift: if a new category is introduced in
        // METRIC_CATEGORY_MAP but never appears in any role's investigationOrder
        // it would silently sort to the end for every role.
        const allOrderedCategories = new Set(
            Object.values(ROLE_CONFIGS).flatMap((rc) => [...rc.investigationOrder]),
        );
        for (const [metric, category] of Object.entries(METRIC_CATEGORY_MAP)) {
            expect(
                allOrderedCategories.has(category),
                `METRIC_CATEGORY_MAP["${metric}"] = "${category}" is not in any ROLE_CONFIGS investigationOrder`,
            ).toBe(true);
        }
    });
});

describe("sortDeltasByRole", () => {
    it("returns an empty array for empty input", () => {
        expect(sortDeltasByRole([], ROLE_CONFIGS.ic.id)).toEqual([]);
    });

    it("never mutates the input array", () => {
        const input = [makeDelta("cycle_time"), makeDelta("review_latency")];
        const original = [...input];
        sortDeltasByRole(input, ROLE_CONFIGS.ic.id);
        expect(input).toEqual(original);
    });

    it("sorts by em investigationOrder: wip first, then review, cycle, investment", () => {
        // em order from ROLE_CONFIGS.em.investigationOrder: ["wip","review","cycle","investment"]
        const deltas = [
            makeDelta("cycle_time"),
            makeDelta("review_latency"),
            makeDelta("wip"),
            makeDelta("coverage"),
        ];
        const sorted = sortDeltasByRole(deltas, ROLE_CONFIGS.em.id);
        expect(sorted.map((d) => d.metric)).toEqual([
            "wip",
            "review_latency",
            "cycle_time",
            "coverage",
        ]);
    });

    it("sorts by leadership investigationOrder: investment, churn, cycle, wip", () => {
        // leadership order: ["investment","churn","cycle","wip"]
        const deltas = [
            makeDelta("wip"),
            makeDelta("cycle_time"),
            makeDelta("churn"),
            makeDelta("coverage"),
        ];
        const sorted = sortDeltasByRole(deltas, ROLE_CONFIGS.leadership.id);
        expect(sorted.map((d) => d.metric)).toEqual(["coverage", "churn", "cycle_time", "wip"]);
    });

    it("within same category, surfaces the largest absolute delta_pct first", () => {
        // All three metrics are in 'churn' category; pm leads with churn.
        const deltas = [
            makeDelta("churn", -3),
            makeDelta("rework_ratio", 15),
            makeDelta("pr_rework_ratio", -8),
        ];
        const sorted = sortDeltasByRole(deltas, ROLE_CONFIGS.pm.id);
        expect(sorted[0].metric).toBe("rework_ratio"); // |15| > |-8| > |-3|
        expect(sorted[1].metric).toBe("pr_rework_ratio");
        expect(sorted[2].metric).toBe("churn");
    });

    it("appends unknown-category metrics after known ones in original relative order", () => {
        // ic leads with review; unknown metrics have no category → sink to end.
        const deltas = [
            makeDelta("unknown_metric_a"),
            makeDelta("review_latency"),
            makeDelta("unknown_metric_b"),
        ];
        const sorted = sortDeltasByRole(deltas, ROLE_CONFIGS.ic.id);
        expect(sorted[0].metric).toBe("review_latency");
        expect(sorted[1].metric).toBe("unknown_metric_a");
        expect(sorted[2].metric).toBe("unknown_metric_b");
    });

    it("preserves original order (by magnitude) for neutral lens", () => {
        // neutral lens → applyLensPriority returns items in pre-sort order.
        // All delta_pct = 0 → magnitude pre-sort is stable → original order preserved.
        const deltas = [makeDelta("cycle_time"), makeDelta("review_latency"), makeDelta("wip")];
        const sorted = sortDeltasByRole(deltas, "neutral");
        expect(sorted.map((d) => d.metric)).toEqual(["cycle_time", "review_latency", "wip"]);
    });
});
