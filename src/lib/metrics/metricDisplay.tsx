import type { MetricCardProps } from "@/components/metrics/MetricCard";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import type { MetricDelta } from "@/lib/types";

/** The tile text for a metric whose window holds no data (the Home monitoring wording). */
export const NO_DATA_FOR_WINDOW = "No data for this window";

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

type ServedMetric = Pick<MetricDelta, "has_data" | "has_prior_data">;

/**
 * The one rule for a served metric (the operating review tile's rule): a flag that is absent
 * counts as data, a flag that is exactly `false` means none; the value is drawn only with data;
 * a change only when the current AND the prior window have data. A measured 0 is still a 0.
 */
export function metricDisplay(metric: ServedMetric | null | undefined): MetricDisplay {
    if (!metric) {
        return { state: "missing", hasData: false, hasPriorData: false, comparable: false };
    }
    const hasData = metric.has_data !== false;
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
 * so the card says "No prior period"; a tile with no value says why and draws no change or trend.
 */
export function metricCardProps(
    metric:
        | Pick<MetricDelta, "value" | "unit" | "delta_pct" | "has_data" | "has_prior_data">
        | null
        | undefined,
): Pick<MetricCardProps, "value" | "valueText" | "unit" | "delta" | "deltaSlot" | "hideTrend"> {
    const display = metricDisplay(metric);
    if (!metric || display.state === "missing") {
        return { valueText: NOT_REPORTED, deltaSlot: <></>, hideTrend: true };
    }
    if (display.state === "no-data") {
        return { valueText: NO_DATA_FOR_WINDOW, deltaSlot: <></>, hideTrend: true };
    }
    return {
        value: metric.value,
        unit: metric.unit,
        delta: display.comparable ? metric.delta_pct : undefined,
    };
}
