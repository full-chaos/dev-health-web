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

/**
 * The line beside a forecast that names which of the team's work scopes it is (CHAOS-12726). A team
 * is forecast under several work scopes and a claim states one, so the chart never stands as the
 * team's own. Every value is served: the scope is the summary's `work_scope_id` and the count is its
 * `scope_count` (a floor when `scope_count_at_least`). Absent when the summary names no scope or
 * serves no count: nothing is guessed, and a team with one scope needs no line.
 */
export function forecastScopeNote(summary: ForecastShapeDetail["summary"]): string | undefined {
    const { work_scope_id: scope, scope_count: count, scope_count_at_least: atLeast } = summary;
    if (scope === undefined || scope === "" || count === undefined || count < 2) return undefined;
    return `Work scope ${scope}. The team has ${atLeast === true ? "at least " : ""}${count} work scopes.`;
}
