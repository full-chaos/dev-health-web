import type { MetricCardProps } from "@/components/metrics/MetricCard";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { getMetricPolarity } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

/** The tile text for a metric whose window holds no data (the Home monitoring wording). */
export const NO_DATA_FOR_WINDOW = "No data for this window";

/** The reason texts for a rate that is not measured (ruled wording, one place for every surface). */
export const NO_INCIDENT_DATA = "No incident data for this window";
export const NO_DEPLOYMENTS = "No deployments in this window";
export const NO_REVIEW_DATA = "No review data for this window";
export const NO_REWORK_SIGNAL = "Rework is not measurable for this provider";
export const NO_MERGED_PULL_REQUESTS = "No merged pull requests in this window";
export const NOT_MEASURED_YET = "Not measured yet";

const NOT_MEASURED_STATE_TEXT: Readonly<Record<string, string>> = {
    unknown_no_incident_evidence: NO_INCIDENT_DATA,
    not_applicable_no_deployments: NO_DEPLOYMENTS,
    // The PR rework ratio's states (CHAOS-9074). State names are distinct, so one map serves both.
    unknown_no_review_evidence: NO_REVIEW_DATA,
    not_applicable_no_rework_signal: NO_REWORK_SIGNAL,
    not_applicable_no_merged_pull_requests: NO_MERGED_PULL_REQUESTS,
};

/** Revert rate is served on every surface but is not measured anywhere yet. */
export const REVERT_RATE_KEY = "revert_rate";

/** A served rate state that means the rate has no value: the served number is a 0 placeholder. */
export function isNotMeasuredState(rateState: string | null | undefined): boolean {
    return typeof rateState === "string" && Object.hasOwn(NOT_MEASURED_STATE_TEXT, rateState);
}

/**
 * The one mapping from a served state to the text of a tile or row with no value. Revert rate
 * says "Not measured yet"; a known state says its reason; a null, absent or unknown future state
 * says "No data for this window" (the raw state string is never printed).
 */
export function noDataText(metric?: string | null, rateState?: string | null): string {
    if (metric === REVERT_RATE_KEY) return NOT_MEASURED_YET;
    if (typeof rateState === "string" && Object.hasOwn(NOT_MEASURED_STATE_TEXT, rateState)) {
        return NOT_MEASURED_STATE_TEXT[rateState];
    }
    return NO_DATA_FOR_WINDOW;
}

export type MetricDisplayState =
    /** No row was served for the metric. */
    | "missing"
    /** A row was served, and its window has no data: the served value is a 0 placeholder. */
    | "no-data"
    /** The window has data. The change is drawn only when `comparable`. */
    | "measured";

export type MetricDisplay = {
    state: MetricDisplayState;
    hasData: boolean;
    hasPriorData: boolean;
    /** Both windows hold data: only then is a change (delta, "No change", trend) drawn. */
    comparable: boolean;
};

type ServedMetric = Pick<MetricDelta, "has_data" | "has_prior_data"> &
    Partial<Pick<MetricDelta, "rate_state">>;

/**
 * The one rule for a served metric (the operating review tile's rule): a flag that is absent
 * counts as data, a flag that is exactly `false` means none; the value is drawn only with data;
 * a change only when the current AND the prior window have data. A measured 0 is still a 0.
 */
export function metricDisplay(metric: ServedMetric | null | undefined): MetricDisplay {
    if (!metric) {
        return { state: "missing", hasData: false, hasPriorData: false, comparable: false };
    }
    // A not-measured state is a producer fact of its own: no value, whatever the flag says.
    const hasData = metric.has_data !== false && !isNotMeasuredState(metric.rate_state);
    const hasPriorData = metric.has_prior_data !== false;
    return {
        state: hasData ? "measured" : "no-data",
        hasData,
        hasPriorData,
        comparable: hasData && hasPriorData,
    };
}

/**
 * The `MetricCard` props that carry the rule, for a served metric row (or none). Spread them
 * first and add the surface's own props after. A change that is not comparable is `undefined`,
 * so the card says "No prior period"; a null percent with both windows measured stays `null`
 * (the card says "+12 from 0"); a tile with no value says why and draws no change or trend.
 */
export function metricCardProps(
    metric:
        | (Pick<MetricDelta, "value" | "unit" | "delta_pct" | "has_data" | "has_prior_data"> &
              Partial<Pick<MetricDelta, "metric" | "rate_state">>)
        | null
        | undefined,
): Pick<
    MetricCardProps,
    | "value"
    | "valueText"
    | "valueIsMessage"
    | "unit"
    | "delta"
    | "polarity"
    | "deltaSlot"
    | "hideTrend"
> {
    const display = metricDisplay(metric);
    if (!metric || display.state === "missing") {
        return { valueText: NOT_REPORTED, valueIsMessage: true, deltaSlot: <></>, hideTrend: true };
    }
    if (display.state === "no-data") {
        return {
            valueText: noDataText(metric.metric, metric.rate_state),
            valueIsMessage: true,
            deltaSlot: <></>,
            hideTrend: true,
        };
    }
    return {
        value: metric.value,
        unit: metric.unit,
        delta: display.comparable ? metric.delta_pct : undefined,
        // The change's tone follows the metric's catalog direction; an unknown metric is neutral.
        polarity: metric.metric ? getMetricPolarity(metric.metric) : undefined,
    };
}
