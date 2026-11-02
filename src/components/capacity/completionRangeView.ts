import type { RangeMarker, RangePoint } from "@/components/charts/CompletionRangeChart";
import { dayCount, formatDayOffset, formatServedDay } from "@/lib/capacityDates";
import { formatNumber } from "@/lib/formatters";
import type { CapacityForecast } from "@/lib/graphql/types";

import { PERCENTILE_ROLE, type Percentile } from "./ForecastTiles";

/**
 * One stored completion forecast, as any served form of it reads (CHAOS-12622). The capacity page
 * reads it from GraphQL (`completionRangeInput`); an Ask Dev answer reads it from the cited cells
 * of its forecast claim. A value that is not served is absent: no other number takes its place.
 */
export type CompletionRangeInput = {
    /** The served bins, ascending by day: the day, the runs that ended on it, the served share. */
    readonly bins?: ReadonlyArray<{
        readonly day: number;
        readonly count?: number;
        readonly cumulativeShare: number;
    }>;
    /** When the forecast was computed: day 0 of the axis. */
    readonly computedAt: string;
    /** The run total of the simulation. */
    readonly runs?: number;
    /** The day the simulation stops a run that is not done. */
    readonly horizonDays?: number;
    /** The runs stopped at the horizon. */
    readonly unfinishedRuns?: number;
    /** The item count the simulation ran on. */
    readonly targetItems?: number;
    /** The forecast's own percentile days and dates. */
    readonly percentiles: Readonly<
        Record<Percentile, { readonly days?: number; readonly date?: string }>
    >;
};

/** What the card draws and says for one served forecast. */
export type CompletionRangeView =
    | { readonly reported: false }
    | {
          readonly reported: true;
          readonly points: RangePoint[];
          readonly markers: RangeMarker[];
          readonly planningRange: { from: number; to: number } | null;
          readonly chanceAxisName: string;
          readonly dayLabel: (day: number) => string;
          readonly tooltipLines: (point: RangePoint) => string[];
          /** "Monte Carlo forecast: each step is …": the words under the chart. */
          readonly note: (interpolation: "step" | "curve") => string;
          /** "80 of 200 runs did not finish within 365 days.", or null when there is none. */
          readonly unfinished: string | null;
      };

const PERCENTILES: readonly Percentile[] = ["P50", "P85", "P95"];

const served = (value: number | null | undefined): number | undefined =>
    typeof value === "number" ? value : undefined;

const percentText = (share: number) =>
    `${formatNumber(share * 100, { maximumFractionDigits: 1 })}%`;

/** The role word of a percentile as a label line starts with it: "Optimistic", "Target". */
const roleWord = (name: Percentile) => {
    const role = PERCENTILE_ROLE[name];
    return `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
};

/** The capacity page's form: GraphQL `CapacityForecast` as the input. Reads only; no arithmetic. */
export function completionRangeInput(forecast: CapacityForecast): CompletionRangeInput {
    const distribution = forecast.completionDistribution;
    return {
        bins: distribution?.days?.map((bin) => ({
            day: bin.value,
            count: bin.count,
            cumulativeShare: bin.cumulativeShare,
        })),
        computedAt: forecast.computedAt,
        runs: served(distribution?.runs),
        horizonDays: served(distribution?.horizonDays),
        unfinishedRuns: served(distribution?.unfinishedRuns),
        targetItems: served(forecast.targetItems),
        percentiles: {
            P50: { days: served(forecast.p50Days), date: forecast.p50Date ?? undefined },
            P85: { days: served(forecast.p85Days), date: forecast.p85Date ?? undefined },
            P95: { days: served(forecast.p95Days), date: forecast.p95Date ?? undefined },
        },
    };
}

/**
 * The "Completion range" mapping (CHAOS-8477), one copy for every surface that draws it
 * (CHAOS-12622): the capacity page and the Ask Dev forecast slot.
 *
 * Every value is served. The curve is the served bins (the day and the served cumulative share);
 * the markers and the planning range are the forecast's own P50 / P85 / P95 days and dates; the
 * axis names the served item count; the run total in the words is the served run total. It adds
 * nothing up and puts no point on the curve.
 *
 * Runs that did not finish (CHAOS-8532): a run stopped at the served horizon is not done. The served
 * shares count the finished runs only, so the curve can end below 100% and is never closed. A bin,
 * a marker or a tooltip at the horizon means "that many days or more" and names no finish date.
 *
 * No served bins: not reported. Never an empty or a made-up curve.
 */
export function completionRangeView(input: CompletionRangeInput): CompletionRangeView {
    const bins = input.bins && input.bins.length > 0 ? input.bins : null;
    if (!bins) return { reported: false };

    const runs = typeof input.runs === "number" && input.runs > 0 ? input.runs : null;
    const horizonDays = typeof input.horizonDays === "number" ? input.horizonDays : null;
    const unfinishedRuns = typeof input.unfinishedRuns === "number" ? input.unfinishedRuns : null;
    const simulatedItems = typeof input.targetItems === "number" ? input.targetItems : null;
    const { computedAt } = input;

    const points = bins.map((bin): RangePoint => ({ day: bin.day, share: bin.cumulativeShare }));

    const markers = PERCENTILES.flatMap((name): RangeMarker[] => {
        const { days: day, date } = input.percentiles[name];
        if (typeof day !== "number") return [];
        // At the horizon the percentile means "that many days or more": the served date is not a
        // finish date, so no date.
        const atHorizon = day === horizonDays;
        return [
            {
                name,
                day,
                // Two lines as the prototype (CHAOS-8614). "P85 · Jun 25": the served date.
                label: [name, !atHorizon && date ? formatServedDay(date) : null]
                    .filter(Boolean)
                    .join(" · "),
                // "Target · 24 days": the role word of the percentile, the served days.
                detail: `${roleWord(name)} · ${dayCount(day)}${atHorizon ? " or more" : ""}`,
            },
        ];
    });

    const p50Days = input.percentiles.P50.days;
    const p95Days = input.percentiles.P95.days;
    const planningRange =
        typeof p50Days === "number" && typeof p95Days === "number" && p50Days < p95Days
            ? { from: p50Days, to: p95Days }
            : null;

    // A day of the axis as its date: the day the forecast was computed plus the day offset. The
    // horizon day is "that date or later".
    const dayLabel = (day: number) => {
        const date = formatDayOffset(computedAt, day) ?? `Day ${day}`;
        return day === horizonDays ? `${date} or later` : date;
    };

    // "80 of 200 runs did not finish within 365 days": served numbers only; the run total is left
    // out when it is not served.
    const didNotFinish = (count: number, horizon: number) =>
        runs === null
            ? `${formatNumber(count)} ${count === 1 ? "run" : "runs"} did not finish within ${dayCount(horizon)}`
            : `${formatNumber(count)} of ${formatNumber(runs)} runs did not finish within ${dayCount(horizon)}`;

    const tooltipLines = (point: RangePoint) => {
        const count = bins.find((bin) => bin.day === point.day)?.count;
        // The bin at the horizon holds the runs that were stopped there: they did not end.
        const atHorizon = horizonDays !== null && point.day === horizonDays;
        const ended =
            count === undefined
                ? []
                : atHorizon
                  ? [didNotFinish(count, point.day)]
                  : [
                        runs === null
                            ? `${formatNumber(count)} ${count === 1 ? "run" : "runs"} ended on this day`
                            : `${formatNumber(count)} of ${formatNumber(runs)} runs ended on this day`,
                    ];
        return [
            `${dayCount(point.day)}${atHorizon ? " or more" : ""} after the forecast`,
            `${percentText(point.share)} of the runs were done by this day`,
            ...ended,
        ];
    };

    const allItems =
        simulatedItems === null
            ? "all items"
            : simulatedItems === 1
              ? "the 1 item"
              : `all ${formatNumber(simulatedItems)} items`;
    const isOrAre = simulatedItems === 1 ? "is" : "are";
    const wasOrWere = simulatedItems === 1 ? "was" : "were";

    return {
        reported: true,
        points,
        markers,
        planningRange,
        chanceAxisName: `Chance ${allItems} ${isOrAre} done`,
        dayLabel,
        tooltipLines,
        note: (interpolation) =>
            `Monte Carlo forecast: each ${interpolation === "curve" ? "point" : "step"} is the share of the ${runs === null ? "" : `${formatNumber(runs)} `}simulation runs in which ${allItems} ${wasOrWere} done by that day.`,
        unfinished:
            unfinishedRuns !== null && unfinishedRuns > 0 && horizonDays !== null
                ? `${didNotFinish(unfinishedRuns, horizonDays)}.`
                : null,
    };
}
