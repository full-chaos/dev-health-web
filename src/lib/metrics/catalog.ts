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
 * Categories align with the `investigationOrder` entries in roleContext.ts
 * ("review", "cycle", "churn", "wip", "investment").
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
 * Sort `deltas` according to a role's `investigationOrder`.
 *
 * - Metrics whose category appears first in `investigationOrder` sort first.
 * - Within a category, the biggest absolute delta_pct surfaces first.
 * - Metrics with no matching category sort to the end in original order.
 * - Never mutates the input; always returns a new array.
 */
export function sortDeltasByRole(
    deltas: MetricDelta[],
    investigationOrder: readonly string[],
): MetricDelta[] {
    return [...deltas].sort((a, b) => {
        const catA = METRIC_CATEGORY_MAP[a.metric] ?? "";
        const catB = METRIC_CATEGORY_MAP[b.metric] ?? "";
        const ia = catA ? investigationOrder.indexOf(catA) : -1;
        const ib = catB ? investigationOrder.indexOf(catB) : -1;
        // Unknown categories sink to the end
        const normA = ia === -1 ? investigationOrder.length : ia;
        const normB = ib === -1 ? investigationOrder.length : ib;
        if (normA !== normB) return normA - normB;
        // Within the same category: larger absolute delta first
        return Math.abs(b.delta_pct) - Math.abs(a.delta_pct);
    });
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
