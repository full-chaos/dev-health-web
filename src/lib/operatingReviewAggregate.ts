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

const ADDITIVE_METRIC_KEYS = new Set([
    "throughput",
    "wip_count",
    // Investment metrics count discrete delivery units — summing across teams is
    // correct; averaging would understate the combined load (see ops docs/api/operating-review.md).
    "ktlo_units",
    "new_value_units",
    "security_units",
    "infra_units",
]);

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

    // A team with no stored value carries a 0 placeholder (CHAOS-8115): it is left out of the
    // combined number, for the week and for the prior week apart. With no team left, the combined
    // metric has no data for that week.
    const withValue = metrics.filter(hasValue);
    const withPrior = metrics.filter(hasPrior);
    const aggregateValue = withValue.length
        ? aggregateMetricValue(withValue, ceilingMetric, "value")
        : 0;
    const aggregatePriorValue = withPrior.length
        ? aggregateMetricValue(withPrior, ceilingMetric, "priorValue")
        : 0;
    const absolute = aggregateValue - aggregatePriorValue;
    const percent = aggregatePriorValue === 0 ? null : (absolute / aggregatePriorValue) * 100;

    return {
        ...ceilingMetric,
        value: aggregateValue,
        hasData: withValue.length > 0,
        delta: {
            ...ceilingMetric.delta,
            value: aggregateValue,
            priorValue: aggregatePriorValue,
            absolute,
            percent,
            // Only a team with both weeks has a status that compares two stored values.
            status: aggregateStatus(
                metrics
                    .filter((metric) => hasValue(metric) && hasPrior(metric))
                    .map((metric) => metric.delta.status),
            ),
            hasPriorData: withPrior.length > 0,
        },
    };
}

/** The week holds a stored value. An answer with no flag (an API before it) counts as data. */
const hasValue = (metric: OperatingReviewMetric) => metric.hasData !== false;
/** The prior week holds a stored value. */
const hasPrior = (metric: OperatingReviewMetric) => metric.delta.hasPriorData !== false;

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
    // A ceiling with no stored value is a 0 placeholder: it is no ceiling.
    const ceilingHasData = key === "value" ? hasValue(ceilingMetric) : hasPrior(ceilingMetric);
    return ceilingHasData ? Math.min(sum, ceiling) : sum;
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
