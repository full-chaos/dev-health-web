// ── Area-signal ordering + grouping (CHAOS-2074) ──────────────────────────────
//
// Pure helpers shared by {@link AreaHub} and the area resolvers so the severity
// order and cluster grouping are defined once and tested in isolation.
//
// Ordering (owner decision 1 — honest states):
//   critical > high > medium > low > neutral > unavailable
// Real signals sort first; "neutral" (informational, non-severity) sits above
// the genuinely-unavailable cards, which always sink to the bottom.

import type { AreaSignal, AreaSignalState } from "./types";

/** Lower rank = higher up the list. Unavailable always last. */
export const STATE_RANK: Record<AreaSignalState, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    neutral: 4,
    unavailable: 5,
};

/** True when the signal has a real, surfaced value (not the honest-empty state). */
export function isAvailable(signal: AreaSignal): boolean {
    return signal.state !== "unavailable";
}

/**
 * Stable severity sort: by {@link STATE_RANK} ascending, ties preserved in input
 * order (so resolvers control intra-band ordering). Does not mutate the input.
 */
export function sortBySeverity(signals: readonly AreaSignal[]): AreaSignal[] {
    return signals
        .map((signal, index) => ({ signal, index }))
        .sort((a, b) => {
            const byDemotion =
                Number(a.signal.demoted === true) - Number(b.signal.demoted === true);
            if (byDemotion !== 0 && isAvailable(a.signal) && isAvailable(b.signal)) {
                return byDemotion;
            }
            const byState = STATE_RANK[a.signal.state] - STATE_RANK[b.signal.state];
            return byState !== 0 ? byState : a.index - b.index;
        })
        .map(({ signal }) => signal);
}

export type SignalCluster = {
    /** Cluster header, or `undefined` for the flat (unclustered) bucket. */
    cluster: string | undefined;
    signals: AreaSignal[];
};

/**
 * Group signals into severity-sorted clusters, preserving first-seen cluster
 * order. Returns a single `{ cluster: undefined }` bucket when no signal carries
 * a cluster (light areas degrade to a flat grid).
 */
export function groupByCluster(signals: readonly AreaSignal[]): SignalCluster[] {
    const order: (string | undefined)[] = [];
    const byCluster = new Map<string | undefined, AreaSignal[]>();

    for (const signal of signals) {
        const key = signal.cluster;
        if (!byCluster.has(key)) {
            byCluster.set(key, []);
            order.push(key);
        }
        byCluster.get(key)!.push(signal);
    }

    return order.map((cluster) => ({
        cluster,
        signals: sortBySeverity(byCluster.get(cluster)!),
    }));
}
