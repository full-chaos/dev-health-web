import {
    CompletionSpreadChart,
    type SpreadMarker,
} from "@/components/charts/CompletionSpreadChart";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { servedRuns } from "@/lib/capacityChance";
import { formatNumber } from "@/lib/formatters";
import type { CapacityDistributionBin, CapacityForecast } from "@/lib/graphql/types";

const present = (bins?: CapacityDistributionBin[] | null) =>
    bins && bins.length > 0 ? bins : null;

const markersOf = (
    values: Array<[string, number | undefined, string | undefined]>,
): SpreadMarker[] =>
    values.flatMap(([name, value, date]) =>
        value === undefined || value === null ? [] : [{ name, value, date }],
    );

/** The name of the chance axis: the served target item count, when it is served. */
const chanceAxisName = (targetItems: number | undefined) =>
    typeof targetItems !== "number"
        ? "Chance the target items are done"
        : targetItems === 1
          ? "Chance the 1 item is done"
          : `Chance all ${formatNumber(targetItems)} items are done`;

/** The served P50 to P95 span, when both are served and differ: the band behind the chance curve. */
const planningRangeOf = (p50: number | undefined, p95: number | undefined) =>
    typeof p50 === "number" && typeof p95 === "number" && p50 < p95 ? { from: p50, to: p95 } : null;

function SpreadChart({
    title,
    bins,
    unit,
    markers,
    runs,
    chanceAxis,
    planningRange,
}: {
    title: string;
    bins: CapacityDistributionBin[];
    unit: "days" | "items";
    markers: SpreadMarker[];
    /** The served run total, or null when it is not served. */
    runs: number | null;
    /** Days mode only: the name of the chance axis; the chart then draws the chance curve. */
    chanceAxis?: string;
    planningRange?: { from: number; to: number } | null;
}) {
    return (
        <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-(--text-muted)">
                {title}
            </h4>
            <CompletionSpreadChart
                bins={bins}
                unit={unit}
                markers={markers}
                runs={runs}
                chanceAxisName={chanceAxis}
                planningRange={planningRange}
            />
            {bins.length === 1 ? (
                <p className="mt-2 text-xs text-(--text-muted)">
                    {unit === "days"
                        ? "Every simulated run ended on the same day."
                        : "Every simulated run ended on the same item count."}
                </p>
            ) : null}
        </div>
    );
}

/**
 * How the simulated outcomes behind the forecast spread (CHAOS-7977). Draws only the
 * distribution the API returned (`completionDistribution`). A forecast stored before the
 * distribution existed, or one where neither mode simulated, has none: it reads "Not reported"
 * instead of drawing an empty chart.
 *
 * The run total is the served `runs` (CHAOS-8477). With it the days chart also draws the chance
 * curve (running sum of the served counts over the served total) and the planning range between
 * the served P50 and P95. With no served total there is no curve and no total on the card.
 */
export function CompletionSpread({ forecast }: { forecast: CapacityForecast }) {
    const days = present(forecast.completionDistribution?.days);
    const items = present(forecast.completionDistribution?.items);
    const runs = servedRuns(forecast.completionDistribution?.runs);

    if (!days && !items) {
        // Not served: the rule's state word, then why. Never an empty chart.
        return (
            <div
                data-testid="completion-spread"
                data-reported="false"
                className="flex flex-col gap-1 text-sm text-(--text-muted)"
            >
                <p>{NOT_REPORTED}</p>
                <p className="text-xs">No simulation spread is stored for this forecast.</p>
            </div>
        );
    }

    return (
        <div data-testid="completion-spread" className="flex flex-col gap-6">
            {days ? (
                <SpreadChart
                    title="Days to finish the target items"
                    bins={days}
                    unit="days"
                    markers={markersOf([
                        ["P50", forecast.p50Days, forecast.p50Date],
                        ["P85", forecast.p85Days, forecast.p85Date],
                        ["P95", forecast.p95Days, forecast.p95Date],
                    ])}
                    runs={runs}
                    chanceAxis={chanceAxisName(forecast.targetItems)}
                    planningRange={planningRangeOf(forecast.p50Days, forecast.p95Days)}
                />
            ) : null}
            {items ? (
                <SpreadChart
                    title="Items completed by the target date"
                    bins={items}
                    unit="items"
                    markers={markersOf([
                        ["P50", forecast.p50Items, undefined],
                        ["P85", forecast.p85Items, undefined],
                        ["P95", forecast.p95Items, undefined],
                    ])}
                    runs={runs}
                />
            ) : null}
            <p className="text-xs text-(--text-muted)">
                {runs !== null ? (
                    <span data-testid="completion-spread-runs">
                        {formatNumber(runs)} simulation {runs === 1 ? "run" : "runs"}.
                    </span>
                ) : null}{" "}
                Based on {forecast.historyDays} days of history; read it as a range, not a promise.
            </p>
        </div>
    );
}
