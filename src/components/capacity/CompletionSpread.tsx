import {
    CompletionSpreadChart,
    type SpreadMarker,
} from "@/components/charts/CompletionSpreadChart";
import { Notice } from "@/components/ui/Notice";
import type { CapacityDistributionBin, CapacityForecast } from "@/lib/graphql/types";

const present = (bins?: CapacityDistributionBin[] | null) =>
    bins && bins.length > 0 ? bins : null;

const markersOf = (
    values: Array<[string, number | undefined, string | undefined]>,
): SpreadMarker[] =>
    values.flatMap(([name, value, date]) =>
        value === undefined || value === null ? [] : [{ name, value, date }],
    );

function SpreadChart({
    title,
    bins,
    unit,
    markers,
}: {
    title: string;
    bins: CapacityDistributionBin[];
    unit: "days" | "items";
    markers: SpreadMarker[];
}) {
    return (
        <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-(--text-muted)">
                {title}
            </h4>
            <CompletionSpreadChart bins={bins} unit={unit} markers={markers} />
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
 * distribution the API returned (`completionDistribution`): nothing is computed here. A forecast
 * stored before the distribution existed, or one where neither mode simulated, has none, and says
 * so instead of drawing an empty chart.
 */
export function CompletionSpread({ forecast }: { forecast: CapacityForecast }) {
    const days = present(forecast.completionDistribution?.days);
    const items = present(forecast.completionDistribution?.items);

    if (!days && !items) {
        return (
            <Notice variant="info" live={false} data-testid="completion-spread">
                No simulation spread was stored for this forecast.
            </Notice>
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
                />
            ) : null}
            <p className="text-xs text-(--text-muted)">
                Based on {forecast.historyDays} days of history; read it as a range, not a promise.
            </p>
        </div>
    );
}
