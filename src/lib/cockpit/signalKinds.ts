import type { CockpitSignal, MetricDelta } from "@/lib/types";

/**
 * The kinds of served Home signals, told apart by SERVED fields only (never by title text).
 *
 * The API builds three kinds (ops `internal/queryapi/home/signals.go`):
 * - a metric signal, one per served delta: its `metric` is the metric key of that delta, and it
 *   carries a current value, a previous value and a change;
 * - a risk signal about one entity: its `metric` is the key `compounding_risk`; it carries a
 *   current value only;
 * - a recommendation signal: its `metric` is a rule id; it carries a reference count only.
 */

/** The served metric key of a compounding-risk signal. */
export const RISK_SIGNAL_METRIC = "compounding_risk";

/** A headline metric signal: its served `metric` is one of the served `deltas[].metric`. */
export const isMetricSignal = (
    signal: Pick<CockpitSignal, "metric">,
    deltas: readonly Pick<MetricDelta, "metric">[] = [],
): boolean => deltas.some((delta) => delta.metric === signal.metric);

/** A compounding-risk signal about one entity: its served `metric` is the risk key. */
export const isRiskSignal = (signal: Pick<CockpitSignal, "metric">): boolean =>
    signal.metric === RISK_SIGNAL_METRIC;
