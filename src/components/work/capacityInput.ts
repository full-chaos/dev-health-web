import type { MetricFilter } from "@/lib/filters/types";
import type { CapacityForecastInput } from "@/lib/graphql/types";

/**
 * The forecast input the page asks for: only the FIRST team id of the filter
 * (production behaviour, unchanged) and the filter's range as history days.
 * The view and the Refresh button in the page header build the same input, so
 * they share one urql operation.
 */
export function capacityForecastInput(filters: MetricFilter): CapacityForecastInput {
    const teamId =
        filters.scope.level === "team" && filters.scope.ids.length > 0
            ? filters.scope.ids[0]
            : undefined;
    return { teamId, historyDays: filters.time.range_days ?? 90 };
}
