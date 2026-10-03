import { teamIdsForScope } from "@/lib/filters/capacityScope";
import type { MetricFilter } from "@/lib/filters/types";
import type { CapacityForecastInput } from "@/lib/graphql/types";

/**
 * The forecast input the page asks for: every team id of the filter (CHAOS-7764;
 * it used to send only the first) and the filter's range as history days.
 * The view and the Refresh button in the page header build the same input, so
 * they share one urql operation.
 */
export function capacityForecastInput(filters: MetricFilter): CapacityForecastInput {
    return { teamIds: teamIdsForScope(filters), historyDays: filters.time.range_days ?? 90 };
}
