import type { CapacityForecast } from "@/lib/graphql/types";

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 border-t border-(--border) py-3 text-sm first:border-t-0 first:pt-0">
            <span className="text-(--text-muted)">{label}</span>
            <span className="text-foreground">{value}</span>
        </div>
    );
}

/**
 * The scope label: a work scope, else "All Teams". A team scope has no label:
 * the scope bar already shows it, and a raw team id is not customer copy.
 */
function scopeLabel(forecast: CapacityForecast): string | null {
    if (forecast.workScopeId) return forecast.workScopeId;
    if (forecast.teamId) return null;
    return "All Teams";
}

/** What the forecast was computed from: scope, throughput, history and the remaining items. */
export function ForecastInputsCard({ forecast }: { forecast: CapacityForecast }) {
    const scope = scopeLabel(forecast);
    return (
        <div
            data-testid="forecast-inputs"
            className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
        >
            <h3 className="mb-4 text-sm font-medium text-foreground">Forecast inputs</h3>
            {scope ? <Row label="Scope" value={scope} /> : null}
            <Row
                label="Mean throughput"
                value={`${forecast.throughputMean.toFixed(1)} items/day`}
            />
            <Row
                label="Standard deviation"
                value={`${forecast.throughputStddev.toFixed(1)} items/day`}
            />
            <Row label="History" value={`${forecast.historyDays} days`} />
            <Row label="Remaining items" value={`${forecast.backlogSize}`} />
        </div>
    );
}
