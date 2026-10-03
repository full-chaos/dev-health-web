import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { groupByCluster } from "@/lib/areaSignals/sort";
import type { AreaSignal } from "@/lib/areaSignals/types";

import { areaOverviewFacts } from "./areaOverviewEvidence";

/**
 * The served signals of a grouped hub (`AreaHub`, for example the AI overview) as page facts, in the
 * order the hub draws them: cluster by cluster, cards by severity inside a cluster, signals with no
 * data last. The hub emphasises its top card in place, so it has no hero-first order. Each row is the
 * value and state as the card shows it; a signal with no data reads "Not reported".
 */
export function areaHubFacts(signals: readonly AreaSignal[]): PageFact[] {
    return groupByCluster(signals)
        .flatMap((group) => group.signals)
        .map((signal) => areaOverviewFacts([signal])[0]);
}

/** "View evidence" on a grouped hub page: the PAGE is the subject. */
export function AreaHubEvidenceAction({
    title,
    signals,
}: {
    title: string;
    signals: readonly AreaSignal[];
}) {
    return <PageFactsEvidenceAction title={title} facts={areaHubFacts(signals)} />;
}
