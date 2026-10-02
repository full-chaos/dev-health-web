import type { CockpitSignal, MetricDelta } from "@/lib/types";

/**
 * The name shown in the Signal column of the Home table (approved prototype rows: "Code Churn",
 * "Throughput").
 *
 * A metric signal is built by the API from one served delta, so its short name is the `label` the
 * API served for that metric in `HomeResponse.deltas`. Every other signal (a risk or a
 * recommendation about one entity) keeps its served title unchanged: the title names the entity,
 * and a metric name alone would make several rows read the same. A title is never cut or
 * rebuilt, and the web makes no name of its own.
 */
export const signalMetricLabel = (
    signal: Pick<CockpitSignal, "metric" | "title">,
    deltas: readonly Pick<MetricDelta, "metric" | "label">[] = [],
): string => deltas.find((delta) => delta.metric === signal.metric)?.label || signal.title;
