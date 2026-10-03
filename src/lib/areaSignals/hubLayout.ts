import { groupByCluster, sortBySeverity, type SignalCluster } from "./sort";
import type { AreaSignal } from "./types";

/**
 * The one layout rule of a grouped hub (`AreaHub`, for example the AI overview), as data. The hub
 * draws from it and the "View evidence" facts of the page read it, so the drawer can never list the
 * signals in another order than the page.
 */
export type AreaHubLayout = {
    /** The signals under their group heads: groups in first-seen order, cards by severity, no data last. */
    clusters: SignalCluster[];
    /** True when at least one signal carries a group. */
    isClustered: boolean;
    /** The id of the one emphasised card (the most severe severity-bearing signal), if any. */
    topSignalId: string | undefined;
    /** The signals in the order the hub draws them. */
    order: AreaSignal[];
};

const SEVERITY_STATES = new Set(["critical", "high", "medium", "low"]);

/**
 * The single most-severe severity-bearing signal across the WHOLE area gets the emphasised
 * treatment, in place: sorted globally, so a critical in a later group still wins over a high in an
 * earlier one. Neutral (navigational) and unavailable cards never claim the top slot.
 */
export function areaHubLayout(signals: readonly AreaSignal[]): AreaHubLayout {
    const clusters = groupByCluster(signals);
    const [topSignal] = sortBySeverity(
        signals.filter((signal) => SEVERITY_STATES.has(signal.state)),
    );
    return {
        clusters,
        isClustered: clusters.some((group) => group.cluster != null),
        topSignalId: topSignal?.id,
        order: clusters.flatMap((group) => group.signals),
    };
}
