import type { EvidenceContentSubject } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { AREA_STATE_LABEL } from "@/components/home/severityTokens";
import { groupByCluster, isAvailable, sortBySeverity } from "@/lib/areaSignals/sort";
import type { AreaSignal } from "@/lib/areaSignals/types";

/**
 * The signals of an area overview in the order `AreaOverview` draws them: the hero (the most
 * severe available signal) first, then the grid (the other available signals by severity, then the
 * ones with no data; grouped under their cluster heads where the area has clusters).
 */
export function areaOverviewBodyOrder(signals: readonly AreaSignal[]): AreaSignal[] {
    const available = sortBySeverity(signals.filter(isAvailable));
    const unavailable = signals.filter((signal) => !isAvailable(signal));
    const [hero, ...rest] = available;
    const clusters = groupByCluster([...rest, ...unavailable]);
    const isClustered = clusters.some((group) => group.cluster != null);
    const grid = isClustered
        ? clusters.flatMap((group) => group.signals)
        : [...rest, ...unavailable];
    return hero ? [hero, ...grid] : grid;
}

/**
 * The served signals of an area overview as fact rows, in body order. Each row shows the value and
 * the state exactly as the card shows them; a signal with no data shows "Not reported".
 */
export function AreaOverviewSignalFacts({
    title,
    signals,
    description,
}: {
    title: string;
    signals: readonly AreaSignal[];
    description?: string;
}) {
    return (
        <div data-testid="area-overview-signal-facts">
            {description ? <p className="text-xs text-(--ink-muted)">{description}</p> : null}
            <EvidenceFactList aria-label={`${title} signals`} testId="area-overview-signal-list">
                {areaOverviewBodyOrder(signals).map((signal) => (
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
 * What "View evidence" explains on an area overview page: the PAGE. The drawer lists every served
 * signal of the page in body order. The web maps no area to an explain metric.
 */
export function areaOverviewEvidenceSubject(
    title: string,
    signals: readonly AreaSignal[],
    description?: string,
): EvidenceContentSubject {
    return {
        title,
        content: (
            <AreaOverviewSignalFacts title={title} signals={signals} description={description} />
        ),
    };
}
