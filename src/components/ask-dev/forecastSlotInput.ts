import type { CompletionRangeInput } from "@/components/capacity/completionRangeView";

/**
 * DRAFT (CHAOS-4613, local only): the shape of ask-dev's `ForecastShapeDetail` until web's ask-dev
 * pin exports it. At the pin this type is deleted and the import below replaces it:
 *   import type { ForecastShapeDetail } from "@full-chaos/ask-dev/render";
 */
export type ForecastShapeDetail = {
    readonly kind: "forecast";
    readonly summary: {
        readonly computed_at: string;
        readonly simulation_count?: number;
        readonly horizon_days?: number;
        readonly unfinished_runs?: number;
        readonly forecast_p50_days?: number;
        readonly forecast_p85_days?: number;
        readonly forecast_p95_days?: number;
        readonly forecast_p50_date?: string;
        readonly forecast_p85_date?: string;
        readonly forecast_p95_date?: string;
    };
    readonly rows: ReadonlyArray<{
        readonly day: number;
        readonly runs?: number;
        readonly cumulativeShare: number;
    }>;
};

/**
 * The Ask Dev slot's form (CHAOS-4613): ask-dev's verified forecast detail as the input of the one
 * `completionRangeView` the capacity page draws with. It only reads fields; it does no arithmetic.
 * acr serves no simulated item count, so the item count is absent and the words say "all items".
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
        targetItems: undefined,
        percentiles: {
            P50: { days: summary.forecast_p50_days, date: summary.forecast_p50_date },
            P85: { days: summary.forecast_p85_days, date: summary.forecast_p85_date },
            P95: { days: summary.forecast_p95_days, date: summary.forecast_p95_date },
        },
    };
}
