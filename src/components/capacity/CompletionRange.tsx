"use client";

import { useCallback, useMemo } from "react";

import {
    CompletionRangeChart,
    type RangeMarker,
    type RangePoint,
} from "@/components/charts/CompletionRangeChart";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { dayCount, formatDayOffset, formatServedDay } from "@/lib/capacityDates";
import { formatNumber } from "@/lib/formatters";
import type { CapacityForecast } from "@/lib/graphql/types";

const percentText = (share: number) =>
    `${formatNumber(share * 100, { maximumFractionDigits: 1 })}%`;

/**
 * The "Completion range" card body (CHAOS-8477): the Monte Carlo forecast as a chance curve.
 *
 * Every value is served. The curve is the bins of `completionDistribution.days` (the day and the
 * `cumulativeShare` the API computed); the markers and the planning range are the forecast's own
 * P50 / P85 / P95 days and dates; the axis names the served `targetItems` (the item count the
 * simulation ran on: a fixed-scope target when the request gave one, else the backlog; it is NOT
 * `backlogSize`, which is always the whole loaded backlog of the scope); the run total in the
 * words is the served `runs`. The web adds nothing up and puts no point on the curve. A count
 * that is not served is left out of the words: no other number takes its place.
 *
 * A forecast with no stored distribution (or with no days mode) reads "Not reported": the card
 * never draws an empty or a made-up curve.
 */
export function CompletionRange({ forecast }: { forecast: CapacityForecast }) {
    const distribution = forecast.completionDistribution;
    const bins = distribution?.days && distribution.days.length > 0 ? distribution.days : null;
    const runs =
        typeof distribution?.runs === "number" && distribution.runs > 0 ? distribution.runs : null;
    const { computedAt, p50Days, p85Days, p95Days, p50Date, p85Date, p95Date } = forecast;
    const simulatedItems = typeof forecast.targetItems === "number" ? forecast.targetItems : null;

    const points = useMemo(
        (): RangePoint[] =>
            (bins ?? []).map((bin) => ({ day: bin.value, share: bin.cumulativeShare })),
        [bins],
    );

    const markers = useMemo((): RangeMarker[] => {
        const percentiles: Array<[string, number | undefined, string | undefined]> = [
            ["P50", p50Days, p50Date],
            ["P85", p85Days, p85Date],
            ["P95", p95Days, p95Date],
        ];
        return percentiles.flatMap(([name, day, date]) =>
            typeof day === "number"
                ? [
                      {
                          name,
                          day,
                          // "P85 · Jun 25 · 24 days": percentile, the served date, the served days.
                          label: [name, date ? formatServedDay(date) : null, dayCount(day)]
                              .filter(Boolean)
                              .join(" · "),
                      },
                  ]
                : [],
        );
    }, [p50Date, p50Days, p85Date, p85Days, p95Date, p95Days]);

    const planningRange = useMemo(
        () =>
            typeof p50Days === "number" && typeof p95Days === "number" && p50Days < p95Days
                ? { from: p50Days, to: p95Days }
                : null,
        [p50Days, p95Days],
    );

    // A day of the axis as its date: the day the forecast was computed plus the day offset.
    const dayLabel = useCallback(
        (day: number) => formatDayOffset(computedAt, day) ?? `Day ${day}`,
        [computedAt],
    );

    const tooltipLines = useCallback(
        (point: RangePoint) => {
            const count = bins?.find((bin) => bin.value === point.day)?.count;
            const ended =
                count === undefined
                    ? []
                    : [
                          runs === null
                              ? `${formatNumber(count)} ${count === 1 ? "run" : "runs"} ended on this day`
                              : `${formatNumber(count)} of ${formatNumber(runs)} runs ended on this day`,
                      ];
            return [
                `${dayCount(point.day)} after the forecast`,
                `${percentText(point.share)} of the runs were done by this day`,
                ...ended,
            ];
        },
        [bins, runs],
    );

    if (!bins) {
        // Not served: the rule's state word, then why. Never an empty chart.
        return (
            <div
                data-testid="completion-range"
                data-reported="false"
                className="flex h-80 flex-col items-center justify-center gap-1 text-sm text-(--text-muted)"
            >
                <p>{NOT_REPORTED}</p>
                <p className="text-xs">
                    The forecast has no simulation distribution, so no chance curve is drawn.
                </p>
            </div>
        );
    }

    const allItems =
        simulatedItems === null
            ? "all items"
            : simulatedItems === 1
              ? "the 1 item"
              : `all ${formatNumber(simulatedItems)} items`;
    const isOrAre = simulatedItems === 1 ? "is" : "are";
    const wasOrWere = simulatedItems === 1 ? "was" : "were";

    return (
        <div data-testid="completion-range">
            <CompletionRangeChart
                points={points}
                markers={markers}
                planningRange={planningRange}
                chanceAxisName={`Chance ${allItems} ${isOrAre} done`}
                dayLabel={dayLabel}
                tooltipLines={tooltipLines}
                height={320}
            />
            <p data-testid="completion-range-note" className="mt-2 text-xs text-(--text-muted)">
                Monte Carlo forecast: each step is the share of the{" "}
                {runs === null ? "" : `${formatNumber(runs)} `}simulation runs in which {allItems}{" "}
                {wasOrWere} done by that day.
            </p>
            <p className="mt-2 text-xs text-(--text-muted)">
                Use the target and conservative dates as different planning choices, not as one
                promise.
            </p>
        </div>
    );
}
