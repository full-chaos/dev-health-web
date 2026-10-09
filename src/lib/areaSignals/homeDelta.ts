import { metricDisplay } from "@/lib/metrics/metricDisplay";
import type { MetricDelta } from "@/lib/types";

/** A Home delta as the area resolvers read it: the value AND whether the window has data. */
export type HomeDeltaReading = { value: number; unit: string; hasData: boolean };

/**
 * Find a Home `deltas[]` entry by its backend metric key and keep its no-data flag. On a no-data
 * window the served value is a 0 placeholder, so a caller must check `hasData` before it draws
 * the value or takes a severity from it. The flag rule is `metricDisplay`'s (an absent flag
 * counts as data).
 */
export function homeDeltaReading(
    deltas:
        | Pick<MetricDelta, "metric" | "value" | "unit" | "has_data" | "has_prior_data">[]
        | undefined,
    metric: string,
): HomeDeltaReading | undefined {
    const delta = deltas?.find((d) => d.metric === metric);
    return delta
        ? { value: delta.value, unit: delta.unit, hasData: metricDisplay(delta).hasData }
        : undefined;
}
