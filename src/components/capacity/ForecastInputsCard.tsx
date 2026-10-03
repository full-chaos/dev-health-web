import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Section } from "@/components/ui/Section";
import type { CapacityForecast } from "@/lib/graphql/types";

/**
 * The scope label: a work scope, else the team count for several teams, else
 * "All Teams". One team has no label: the scope bar already shows it, and a raw
 * team id is not customer copy. Several teams come back with no teamId, and a
 * null teamId does not mean all teams, so the selected count is the label.
 */
function scopeLabel(forecast: CapacityForecast, teamCount: number): string | null {
    if (forecast.workScopeId) return forecast.workScopeId;
    if (teamCount > 1) return `${teamCount} teams`;
    if (forecast.teamId) return null;
    return "All Teams";
}

/** What the forecast was computed from: scope, throughput, history and the remaining items. */
export function ForecastInputsCard({
    forecast,
    teamCount = 0,
}: {
    forecast: CapacityForecast;
    teamCount?: number;
}) {
    const scope = scopeLabel(forecast, teamCount);
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
