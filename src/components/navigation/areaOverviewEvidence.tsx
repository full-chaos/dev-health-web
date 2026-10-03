import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
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
 * The served signals of an area overview as page facts, in body order: the value and the state
 * exactly as the card shows them. A signal with no data has no value, so its row reads
 * "Not reported".
 */
export function areaOverviewFacts(signals: readonly AreaSignal[]): PageFact[] {
    return areaOverviewBodyOrder(signals).map((signal) => ({
        label: `${signal.label} · ${signal.metricLabel}`,
        value:
            signal.state === "unavailable"
                ? undefined
                : [signal.value, AREA_STATE_LABEL[signal.state]].filter(Boolean).join(" · "),
    }));
}

/**
 * "View evidence" on an area overview page: the PAGE is the subject. A thin wrapper over the shared
 * `PageFactsEvidenceAction` that lists every served signal of the page in body order. The web maps
 * no area to an explain metric.
 */
export function AreaOverviewEvidenceAction({
    title,
    signals,
}: {
    title: string;
    signals: readonly AreaSignal[];
}) {
    return <PageFactsEvidenceAction title={title} facts={areaOverviewFacts(signals)} />;
}
