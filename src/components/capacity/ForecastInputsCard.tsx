import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Section } from "@/components/ui/Section";
import type { CapacityForecast } from "@/lib/graphql/types";

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
        <Section data-testid="forecast-inputs" title="Forecast inputs">
            <EvidenceFactList aria-label="Forecast inputs" testId="forecast-input-facts">
                {scope ? <EvidenceFact label="Scope" value={scope} /> : null}
                <EvidenceFact
                    label="Mean throughput"
                    value={`${forecast.throughputMean.toFixed(1)} items/day`}
                />
                <EvidenceFact
                    label="Standard deviation"
                    value={`${forecast.throughputStddev.toFixed(1)} items/day`}
                />
                <EvidenceFact label="History" value={`${forecast.historyDays} days`} />
                <EvidenceFact label="Remaining items" value={`${forecast.backlogSize}`} />
            </EvidenceFactList>
        </Section>
    );
}
