"use client";

import { useMemo } from "react";

import { CompletionRangeChart } from "@/components/charts/CompletionRangeChart";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import type { CapacityForecast } from "@/lib/graphql/types";

import {
    completionRangeInput,
    completionRangeView,
    type CompletionRangeView,
} from "./completionRangeView";

/**
 * The "Completion range" card body (CHAOS-8477): the Monte Carlo forecast as a chance curve.
 *
 * Every value is served. The mapping from the served forecast to the curve, the markers, the
 * planning range and the words is `completionRangeView` (CHAOS-12622), the one copy that the Ask
 * Dev forecast slot also draws with. This card reads GraphQL `CapacityForecast` into its input:
 * the curve is the bins of `completionDistribution.days`; the axis names the served `targetItems`
 * (the item count the simulation ran on: a fixed-scope target when the request gave one, else the
 * backlog; it is NOT `backlogSize`, which is always the whole loaded backlog of the scope); the run
 * total in the words is the served `runs`.
 *
 * Runs that did not finish (CHAOS-8532): the served shares count the finished runs only, so the
 * curve can end below 100%: the card never closes it. The served `unfinishedRuns` is said in one
 * sentence.
 *
 * A forecast with no stored distribution (or with no days mode) reads "Not reported": the card
 * never draws an empty or a made-up curve.
 */
export function CompletionRange({
    forecast,
    interpolation = "step",
}: {
    forecast: CapacityForecast;
    interpolation?: "step" | "curve";
}) {
    const view = useMemo(() => completionRangeView(completionRangeInput(forecast)), [forecast]);

    if (!view.reported) {
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

    return <CompletionRangeFigure interpolation={interpolation} view={view} />;
}

/**
 * What the card draws for a reported forecast: the chart and its words. The capacity page and the
 * Ask Dev forecast slot both draw it from `completionRangeView` (CHAOS-4613), so one stored forecast
 * reads the same in both.
 */
export function CompletionRangeFigure({
    view,
    interpolation = "step",
}: {
    view: Extract<CompletionRangeView, { reported: true }>;
    interpolation?: "step" | "curve";
}) {
    return (
        <div data-testid="completion-range">
            <CompletionRangeChart
                points={view.points}
                markers={view.markers}
                planningRange={view.planningRange}
                chanceAxisName={view.chanceAxisName}
                dayLabel={view.dayLabel}
                tooltipLines={view.tooltipLines}
                interpolation={interpolation}
                height={320}
            />
            <p data-testid="completion-range-note" className="mt-2 text-xs text-(--text-muted)">
                {view.note(interpolation)}
            </p>
            {view.unfinished !== null ? (
                <p
                    data-testid="completion-range-unfinished"
                    className="mt-2 text-xs text-(--text-muted)"
                >
                    {view.unfinished}
                </p>
            ) : null}
            {/* The prototype's note paragraph: body size and body colour, not a small muted line. */}
            <p
                data-testid="completion-range-advice"
                className="mt-4 text-[0.8125rem] leading-5.5 text-foreground"
            >
                Use the target and conservative dates as different planning choices, not as one
                promise.
            </p>
        </div>
    );
}
