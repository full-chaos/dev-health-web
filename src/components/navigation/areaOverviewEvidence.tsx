import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { AREA_STATE_LABEL } from "@/components/home/severityTokens";
import { areaClusterOrder, areaOverviewLayout } from "@/lib/areaSignals/overviewLayout";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";

/**
 * The signals of an area overview in the order `AreaOverview` draws them: hero first, then the
 * grid (grouped in the area's group order where the area has groups). It reads the one shared
 * layout rule (`areaOverviewLayout`), so it cannot drift from the page.
 */
export function areaOverviewBodyOrder(
    areaId: NavAreaId,
    signals: readonly AreaSignal[],
): AreaSignal[] {
    const area = getAreaById(areaId);
    return areaOverviewLayout(signals, area ? areaClusterOrder(area) : []).bodyOrder;
}

/** One signal as a page fact: the value and the state exactly as its card shows them. */
export function signalFact(signal: AreaSignal): PageFact {
    return {
        label: `${signal.label} · ${signal.metricLabel}`,
        // A failed read says so; an empty read has no value ("Not reported") (CHAOS-8168).
        value: signal.failed
            ? "Could not be read"
            : signal.state === "unavailable"
              ? undefined
              : [signal.value, AREA_STATE_LABEL[signal.state]].filter(Boolean).join(" · "),
    };
}

/**
 * The served signals of an area overview as page facts, in body order: the value and the state
 * exactly as the card shows them. A signal with no data has no value, so its row reads
 * "Not reported".
 */
export function areaOverviewFacts(areaId: NavAreaId, signals: readonly AreaSignal[]): PageFact[] {
    return areaOverviewBodyOrder(areaId, signals).map(signalFact);
}

/**
 * "View evidence" on an area overview page: the PAGE is the subject. A thin wrapper over the shared
 * `PageFactsEvidenceAction` that lists every served signal of the page in body order. The web maps
 * no area to an explain metric.
 */
export function AreaOverviewEvidenceAction({
    title,
    areaId,
    signals,
}: {
    title: string;
    /** The area whose overview this is (its group order applies). */
    areaId: NavAreaId;
    signals: readonly AreaSignal[];
}) {
    return <PageFactsEvidenceAction title={title} facts={areaOverviewFacts(areaId, signals)} />;
}
