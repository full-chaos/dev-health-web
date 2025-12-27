import type { MetricDelta } from "@/lib/types";

export const METRIC_CATALOG = [
  { metric: "cycle_time", label: "Cycle Time", unit: "days" },
  { metric: "review_latency", label: "Review Latency", unit: "hours" },
  { metric: "throughput", label: "Throughput", unit: "items" },
  { metric: "deploy_freq", label: "Deploy Frequency", unit: "deploys" },
  { metric: "churn", label: "Code Churn", unit: "loc" },
  { metric: "wip_saturation", label: "WIP Saturation", unit: "%" },
  { metric: "blocked_work", label: "Blocked Work", unit: "hours" },
  { metric: "change_failure_rate", label: "Change Failure Rate", unit: "%" },
] as const;

const metricMetaByKey = new Map(
  METRIC_CATALOG.map((item) => [item.metric, item])
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

export const getMetricUnit = (metric: string) =>
  metricMetaByKey.get(metric)?.unit ?? "";
