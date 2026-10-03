import type { NavArea } from "@/lib/navigation/areas";

import { groupByCluster, isAvailable, sortBySeverity, type SignalCluster } from "./sort";
import type { AreaSignal } from "./types";

/**
 * The one layout rule of an area overview (`AreaOverview`), as data. Every caller that needs the
 * order of the page body (the overview itself, the "View evidence" facts of an overview page)
 * reads it from here, so the drawer can never list the signals in another order than the page.
 */
export type AreaOverviewLayout = {
    /** The single most severe available signal, or undefined when none has data. */
    hero: AreaSignal | undefined;
    /** The other available signals, by severity (the hero is never repeated in the grid). */
    restAvailable: AreaSignal[];
    /** The signals with no data (empty / unconnected sub-areas), in input order; always last. */
    unavailable: AreaSignal[];
    /** The grid under its group heads, groups in the area's own order (its hub items). */
    clusters: SignalCluster[];
    /** True when at least one grid signal carries a group. */
    isClustered: boolean;
    /** The grid cards in the order the page draws them (grouped when clustered). */
    grid: AreaSignal[];
    /** Hero first, then the grid: the order of the page body. */
    bodyOrder: AreaSignal[];
};

/** The area's group order: the order of the groups of its hub items (Govern: Quality, then Risk). */
export function areaClusterOrder(area: Pick<NavArea, "hubItems">): string[] {
    return [...new Set(area.hubItems.flatMap((item) => (item.cluster ? [item.cluster] : [])))];
}

/**
 * Real-data signals sort by severity; empty / unconnected sub-areas sink to the muted tier at the
 * bottom (an unavailable metric is never "the top signal"). The single top signal becomes the hero
 * and is dropped from the grid (CHAOS-2082). Groups keep the area's own order, not severity order.
 */
export function areaOverviewLayout(
    signals: readonly AreaSignal[],
    clusterOrder: readonly string[],
): AreaOverviewLayout {
    const available = sortBySeverity(signals.filter(isAvailable));
    const unavailable = signals.filter((signal) => !isAvailable(signal));
    const [hero, ...restAvailable] = available;
    const clusters = groupByCluster([...restAvailable, ...unavailable], clusterOrder);
    const isClustered = clusters.some((group) => group.cluster != null);
    const grid = isClustered
        ? clusters.flatMap((group) => group.signals)
        : [...restAvailable, ...unavailable];
    return {
        hero,
        restAvailable,
        unavailable,
        clusters,
        isClustered,
        grid,
        bodyOrder: hero ? [hero, ...grid] : grid,
    };
}
