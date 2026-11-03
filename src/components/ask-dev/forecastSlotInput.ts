import type { ForecastShapeDetail } from "@full-chaos/ask-dev/render";

import type { CompletionRangeInput } from "@/components/capacity/completionRangeView";

/**
 * The Ask Dev slot's form (CHAOS-4613): ask-dev's verified forecast detail as the input of the one
 * `completionRangeView` the capacity page draws with. It only reads fields; it does no arithmetic.
 * The item target is the stored row's own (acr's `target_items`, CHAOS-12708): with one, the words
 * say "all N items" as the page does; with none stored, it is absent and the words say "all items".
 */
export function forecastSlotInput(detail: ForecastShapeDetail): CompletionRangeInput {
    const { summary } = detail;
    return {
        bins: detail.rows.map((row) => ({
            day: row.day,
            count: row.runs,
            cumulativeShare: row.cumulativeShare,
        })),
        computedAt: summary.computed_at,
        runs: summary.simulation_count,
        horizonDays: summary.horizon_days,
        unfinishedRuns: summary.unfinished_runs,
        targetItems: summary.target_items,
        percentiles: {
            P50: { days: summary.forecast_p50_days, date: summary.forecast_p50_date },
            P85: { days: summary.forecast_p85_days, date: summary.forecast_p85_date },
            P95: { days: summary.forecast_p95_days, date: summary.forecast_p95_date },
        },
    };
}
