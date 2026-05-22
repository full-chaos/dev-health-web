import type {
  OperatingReview,
  OperatingReviewDeltaStatus,
  OperatingReviewMetric,
  OperatingReviewSection,
} from "@/lib/graphql/types";

type AggregateOperatingReviewsInput = {
  ceilingReview: OperatingReview;
  reviews: OperatingReview[];
  teamIds: string[];
};

const ADDITIVE_METRIC_KEYS = new Set(["throughput", "wip"]);

export function aggregateOperatingReviews({
  ceilingReview,
  reviews,
  teamIds,
}: AggregateOperatingReviewsInput): OperatingReview {
  const usableReviews = reviews.length ? reviews : [ceilingReview];

  return {
    ...ceilingReview,
    teamId: teamIds.join(", "),
    sections: ceilingReview.sections.map((section) => aggregateSection(section, usableReviews)),
    recommendations: uniqueStrings(usableReviews.flatMap((review) => review.recommendations)),
    recommendationsEmptyState: ceilingReview.recommendationsEmptyState,
  };
}

function aggregateSection(
  ceilingSection: OperatingReviewSection,
  reviews: OperatingReview[],
): OperatingReviewSection {
  const matchingSections = reviews
    .map((review) => review.sections.find((section) => section.key === ceilingSection.key))
    .filter((section): section is OperatingReviewSection => Boolean(section));

  return {
    ...ceilingSection,
    metrics: ceilingSection.metrics.map((metric) => aggregateMetric(metric, matchingSections)),
    changed: uniqueStrings(matchingSections.flatMap((section) => section.changed)),
    improved: uniqueStrings(matchingSections.flatMap((section) => section.improved)),
    worsened: uniqueStrings(matchingSections.flatMap((section) => section.worsened)),
  };
}

function aggregateMetric(
  ceilingMetric: OperatingReviewMetric,
  sections: OperatingReviewSection[],
): OperatingReviewMetric {
  const metrics = sections
    .map((section) => section.metrics.find((metric) => metric.key === ceilingMetric.key))
    .filter((metric): metric is OperatingReviewMetric => Boolean(metric));

  if (!metrics.length) {
    return ceilingMetric;
  }

  const aggregateValue = aggregateMetricValue(metrics, ceilingMetric, "value");
  const aggregatePriorValue = aggregateMetricValue(metrics, ceilingMetric, "priorValue");
  const absolute = aggregateValue - aggregatePriorValue;
  const percent = aggregatePriorValue === 0 ? null : (absolute / aggregatePriorValue) * 100;

  return {
    ...ceilingMetric,
    value: aggregateValue,
    delta: {
      ...ceilingMetric.delta,
      value: aggregateValue,
      priorValue: aggregatePriorValue,
      absolute,
      percent,
      status: aggregateStatus(metrics.map((metric) => metric.delta.status)),
    },
  };
}

function aggregateMetricValue(
  metrics: OperatingReviewMetric[],
  ceilingMetric: OperatingReviewMetric,
  key: "value" | "priorValue",
): number {
  if (!isAdditiveMetric(ceilingMetric)) {
    return average(
      metrics.map((metric) => (key === "value" ? metric.value : metric.delta.priorValue)),
    );
  }

  const sum = metrics.reduce(
    (total, metric) => total + (key === "value" ? metric.value : metric.delta.priorValue),
    0,
  );
  const ceiling = key === "value" ? ceilingMetric.value : ceilingMetric.delta.priorValue;
  return Math.min(sum, ceiling);
}

function isAdditiveMetric(metric: OperatingReviewMetric): boolean {
  return ADDITIVE_METRIC_KEYS.has(metric.key) || metric.unit.toLowerCase().includes("item");
}

function aggregateStatus(statuses: OperatingReviewDeltaStatus[]): OperatingReviewDeltaStatus {
  if (statuses.includes("worsened")) return "worsened";
  if (statuses.includes("improved")) return "improved";
  if (statuses.includes("changed")) return "changed";
  return "unchanged";
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
