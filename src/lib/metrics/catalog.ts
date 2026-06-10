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
