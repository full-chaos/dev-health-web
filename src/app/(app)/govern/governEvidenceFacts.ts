import type { PageFact } from "@/components/evidence/PageFactsEvidenceAction";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { groupByCluster, isAvailable, sortBySeverity } from "@/lib/areaSignals/sort";

/**
 * The Govern overview's served signals as fact rows for its "View evidence" header action, in
 * the order the page body draws them: the hero (the most severe available signal), then each
 * group in the area's order with its cards by severity, the cards without a served value last.
 * The ordering uses the same helpers as the shared area overview.
 *
 * A row is "<sub-area> — <metric>" with the served value exactly as the card shows it; a sub-area
 * with no served value reads "Not reported" (value left out). No number is made here.
 */
export function governEvidenceFacts(
    signals: readonly AreaSignal[],
    clusterOrder: readonly string[],
): PageFact[] {
    const available = sortBySeverity(signals.filter(isAvailable));
    const unavailable = signals.filter((signal) => !isAvailable(signal));
    const [hero, ...rest] = available;
    const grid = groupByCluster([...rest, ...unavailable], clusterOrder).flatMap(
        (group) => group.signals,
    );
    return [...(hero ? [hero] : []), ...grid].map((signal) => ({
        label: `${signal.label} — ${signal.metricLabel}`,
        value: isAvailable(signal) && signal.value ? signal.value : undefined,
    }));
}
