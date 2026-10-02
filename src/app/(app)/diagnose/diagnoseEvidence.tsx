import type { EvidenceSubject } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { AREA_STATE_LABEL } from "@/components/home/severityTokens";
import { DIAGNOSE_HOME_METRIC } from "@/lib/areaSignals/diagnoseHomeMetric";
import { isAvailable, sortBySeverity } from "@/lib/areaSignals/sort";
import type { AreaSignal } from "@/lib/areaSignals/types";
import type { MetricFilter } from "@/lib/filters/types";

const homeMetricOf = (id: string): string | undefined =>
    (DIAGNOSE_HOME_METRIC as Record<string, string>)[id];

/**
 * The signals of the Diagnose overview as fact rows, in the order of the page (by severity, then
 * the ones with no data). Each row shows the value and the state exactly as the card shows them;
 * a signal with no data shows "Not reported".
 */
export function DiagnoseSignalFacts({ signals }: { signals: AreaSignal[] }) {
    const ordered = [
        ...sortBySeverity(signals.filter(isAvailable)),
        ...signals.filter((signal) => !isAvailable(signal)),
    ];
    return (
        <div data-testid="diagnose-signal-facts">
            <p className="text-xs text-(--ink-muted)">Diagnostic sub-areas, ordered by severity.</p>
            <EvidenceFactList aria-label="Diagnose signals" testId="diagnose-signal-fact-list">
                {ordered.map((signal) => (
                    <EvidenceFact
                        key={signal.id}
                        label={`${signal.label} · ${signal.metricLabel}`}
                        value={
                            signal.state === "unavailable"
                                ? undefined
                                : [signal.value, AREA_STATE_LABEL[signal.state]]
                                      .filter(Boolean)
                                      .join(" · ")
                        }
                    />
                ))}
            </EvidenceFactList>
        </div>
    );
}

/**
 * What "View evidence" explains on the Diagnose overview: the page's primary signal (the same
 * severity rule as the hero). When that signal is a home metric, the drawer loads the evidence of
 * that metric. Otherwise, and when no signal has data, it lists the signals the page shows.
 */
export function diagnoseEvidenceSubject(
    signals: AreaSignal[],
    filters: MetricFilter,
    role?: string,
): EvidenceSubject {
    const primary = sortBySeverity(signals.filter(isAvailable))[0];
    const metric = primary ? homeMetricOf(primary.id) : undefined;
    if (primary && metric) {
        return { title: primary.metricLabel, metric, filters, role };
    }
    return { title: "Diagnose", content: <DiagnoseSignalFacts signals={signals} /> };
}
