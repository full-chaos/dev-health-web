import { applyLensPriority, type LensId } from "@/lib/lensContext";
import type { MetricDelta } from "@/lib/types";

export type MetricPolarity = "lowerIsBetter" | "higherIsBetter";

export const METRIC_CATALOG = [
    {
        metric: "cycle_time",
        label: "Cycle Time",
        unit: "days",
        polarity: "lowerIsBetter",
    },
    {
        metric: "review_latency",
        label: "Review Latency",
        unit: "hours",
        polarity: "lowerIsBetter",
    },
    {
        metric: "throughput",
        label: "Throughput",
        unit: "items",
        polarity: "higherIsBetter",
    },
    {
        metric: "deploy_freq",
        label: "Deploy Frequency",
        unit: "deploys",
        polarity: "higherIsBetter",
    },
    {
        metric: "churn",
        label: "Code Churn",
        unit: "loc",
        polarity: "lowerIsBetter",
    },
    {
        metric: "wip_saturation",
        label: "WIP Saturation",
        unit: "%",
        polarity: "lowerIsBetter",
    },
    {
        metric: "blocked_work",
        label: "Blocked Work",
        unit: "hours",
        polarity: "lowerIsBetter",
    },
    {
        metric: "change_failure_rate",
        label: "Change Failure Rate",
        unit: "%",
        polarity: "lowerIsBetter",
    },
    {
        metric: "ci_success",
        label: "CI Success Rate",
        unit: "%",
        polarity: "higherIsBetter",
    },
    {
        metric: "pr_rework_ratio",
        label: "PR Rework Ratio",
        unit: "%",
        polarity: "lowerIsBetter",
    },
    {
        metric: "rework_ratio",
        label: "Rework Ratio",
        unit: "%",
        polarity: "lowerIsBetter",
    },
    {
        metric: "compounding_risk",
        label: "Compounding Risk",
        unit: "score",
        polarity: "lowerIsBetter",
    },
    {
        metric: "coverage",
        label: "Coverage",
        unit: "%",
        polarity: "higherIsBetter",
    },
    {
        metric: "review_load",
        label: "Review Load",
        unit: "reviews",
        polarity: "lowerIsBetter",
    },
    { metric: "wip", label: "WIP", unit: "items", polarity: "lowerIsBetter" },
    {
        metric: "wip_overlap",
        label: "WIP Overlap",
        unit: "items",
        polarity: "lowerIsBetter",
    },
    {
        metric: "churn_loc",
        label: "Churn LOC",
        unit: "loc",
        polarity: "lowerIsBetter",
    },
] as const;

type MetricMeta = (typeof METRIC_CATALOG)[number];

const metricMetaByKey = new Map<string, MetricMeta>(
    METRIC_CATALOG.map((item) => [item.metric, item]),
);

export const FALLBACK_DELTAS: MetricDelta[] = METRIC_CATALOG.map((item) => ({
    ...item,
    value: 0,
    delta_pct: 0,
    spark: [],
}));

/**
 * Maps each metric key to its investigation-flow category.
 *
 * Category strings must exactly match the `investigationOrder` entries defined
 * in `src/lib/roleContext.ts` (e.g. "review", "cycle", "churn", "wip",
 * "investment") — these are the canonical vocabulary.  `applyLensPriority`
 * from lensContext is the single ordering implementation; this map is its
 * metric-level input.
 */
export const METRIC_CATEGORY_MAP: Record<string, string> = {
    review_latency: "review",
    review_load: "review",
    cycle_time: "cycle",
    throughput: "cycle",
    deploy_freq: "cycle",
    ci_success: "cycle",
    change_failure_rate: "cycle",
    churn: "churn",
    churn_loc: "churn",
    rework_ratio: "churn",
    pr_rework_ratio: "churn",
    compounding_risk: "churn",
    wip: "wip",
    wip_saturation: "wip",
    wip_overlap: "wip",
    blocked_work: "wip",
    coverage: "investment",
};

/**
 * Sort `deltas` by the given lens's `investigationOrder`.
 *
 * Delegates category ordering to `applyLensPriority` (the single ordering
 * implementation).  Within each category, larger |delta_pct| surfaces first:
 * pre-sort by magnitude so `applyLensPriority`'s stable sort preserves it.
 * Metrics with no matching category are appended in their original order.
 * Never mutates the input array.
 */
export function sortDeltasByRole(deltas: MetricDelta[], lensId: string): MetricDelta[] {
    // 1. Pre-sort by magnitude so stable sort preserves within-category ordering.
    const byMagnitude = [...deltas].sort(
        (a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct),
    );
    // 2. Wrap as category-proxy items: applyLensPriority orders by item.id.
    const proxied = byMagnitude.map((delta) => ({
        id: METRIC_CATEGORY_MAP[delta.metric] ?? delta.metric,
        delta,
    }));
    // 3. Apply role-aware ordering then unwrap.
    return applyLensPriority(proxied, lensId as LensId, "cockpit").map((p) => p.delta);
}

export const getMetricLabel = (metric: string) => {
    const match = metricMetaByKey.get(metric);
    if (match) {
        return match.label;
    }
    return metric
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

export const getMetricUnit = (metric: string) => metricMetaByKey.get(metric)?.unit ?? "";
export const getMetricPolarity = (metric: string): MetricPolarity | undefined =>
    metricMetaByKey.get(metric)?.polarity;
