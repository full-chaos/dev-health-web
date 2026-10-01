import { Notice } from "@/components/ui/Notice";
import type { CapacityForecast } from "@/lib/graphql/types";

/**
 * The two forecast warnings, in one warning notice above the tiles (one line
 * each, the same words as before). Nothing is rendered when neither applies.
 */
export function ForecastNotices({ forecast }: { forecast: CapacityForecast }) {
    const { insufficientHistory, highVariance } = forecast;
    if (!insufficientHistory && !highVariance) return null;

    return (
        <Notice variant="warn" live={false} data-testid="forecast-warnings">
            <div className="space-y-1">
                {insufficientHistory ? (
                    <p>Limited history available. Forecast may be less reliable.</p>
                ) : null}
                {highVariance ? (
                    <p>High throughput variance detected. Consider using more history days.</p>
                ) : null}
            </div>
        </Notice>
    );
}
