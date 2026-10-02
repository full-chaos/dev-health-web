import type { ReactNode } from "react";

import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { groupByCluster, isAvailable, sortBySeverity } from "@/lib/areaSignals/sort";

import { AreaSignalCard } from "./AreaSignalCard";
import { PrimarySignalHero } from "./PrimarySignalHero";

// ── AreaOverview (CHAOS-2082) ─────────────────────────────────────────────────
//
// The ONE shared Overview contract for every decision area (Framework A2a:
// "summarize + route, never duplicate child workflows"). Govern / Diagnose /
// Improve adopt it now; Plan / AI adopt it as they land (J4 / J7).
//
// Contract:
//   - ONE primary-signal hero: the single most-severe available sub-area, rendered
//     by `PrimarySignalHero` (value as served, one primary action).
//   - Where the area defines clusters, the grid is split under group heads
//     (Govern: Quality, Risk). Without clusters it stays one grid.
//   - A severity-sorted grid of the REMAINING sub-area signal cards. The hero's
//     sub-area is EXCLUDED from the grid, so no card is ever repeated between
//     hero and grid (the duplication fixed by CHAOS-2082).
//   - An empty-state tier: empty / unconnected sub-areas (state "unavailable")
//     render through the muted DataState tier inside `AreaSignalCard` — visibly
//     quieter than real-data cards — and always sort LAST.
//   - It summarizes and ROUTES: every card is a link into its sub-area. The
//     Overview never embeds a full child workflow inline.
//
// Presentational RSC: the area landing resolves the `AreaSignal[]` (via
// `getAreaSignals`) and passes it in. No data-fetching here.

type AreaOverviewProps = {
    areaId: NavAreaId;
    /** Resolved signals for this area (from the landing RSC via getAreaSignals). */
    signals: AreaSignal[];
    filters: MetricFilter;
    role?: string;
    /** Optional eyebrow above the hero. No eyebrow is drawn when omitted. */
    title?: string;
    /** Optional one-line description under the eyebrow. */
    description?: string;
    /** Optional static note under the cards (for example how two destinations differ). */
    note?: ReactNode;
};

export function AreaOverview({
    areaId,
    signals,
    filters,
    role,
    title,
    description,
    note,
}: AreaOverviewProps) {
    const area = getAreaById(areaId);
    if (!area) return null;

    // Real-data signals sort by severity; empty / unconnected sub-areas sink to
    // the muted tier at the bottom. Partitioning here (not just sorting) keeps the
    // hero selection honest — an unavailable metric is never "the top signal".
    const available = sortBySeverity(signals.filter(isAvailable));
    const unavailable = signals.filter((signal) => !isAvailable(signal));

    // The single top signal becomes the hero and is dropped from the grid so no
    // card appears in both hero and grid (CHAOS-2082 acceptance).
    const [hero, ...restAvailable] = available;

    const gridSignals = restAvailable;
    // Groups keep the area's own order (the order of its hub items), not the order of severity.
    const clusterOrder = [
        ...new Set(area.hubItems.flatMap((item) => (item.cluster ? [item.cluster] : []))),
    ];
    const clusters = groupByCluster([...gridSignals, ...unavailable], clusterOrder);
    const isClustered = clusters.some((group) => group.cluster != null);

    const renderGrid = (list: AreaSignal[]) => (
        <div
            data-testid="area-overview-grid"
            className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3"
        >
            {list.map((signal) => (
                <AreaSignalCard key={signal.id} signal={signal} filters={filters} role={role} />
            ))}
        </div>
    );

    if (!hero && gridSignals.length === 0 && unavailable.length === 0) return null;

    return (
        <section
            aria-label={`${area.label} overview`}
            data-testid="area-overview"
            className="flex flex-col gap-6"
        >
            {title || description ? (
                <div>
                    {title ? (
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            {title}
                        </p>
                    ) : null}
                    {description ? (
                        <p className={`${title ? "mt-1 " : ""}text-sm text-(--ink-muted)`}>
                            {description}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {hero ? (
                <div data-testid="area-overview-hero">
                    <PrimarySignalHero
                        signal={
                            hero as typeof hero & {
                                state: Exclude<typeof hero.state, "unavailable">;
                            }
                        }
                        filters={filters}
                        role={role}
                        actionLabel={
                            area.hubItems.find(
                                (item) => item.id === hero.id || item.href === hero.href,
                            )?.heroCta
                        }
                    />
                </div>
            ) : null}

            {gridSignals.length > 0 || unavailable.length > 0 ? (
                isClustered ? (
                    <div className="space-y-6">
                        {clusters.map((group) => (
                            <div
                                key={group.cluster ?? "_flat"}
                                data-testid="area-overview-cluster"
                                data-cluster={group.cluster ?? ""}
                            >
                                {group.cluster ? (
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                                        {group.cluster}
                                    </p>
                                ) : null}
                                {renderGrid(group.signals)}
                            </div>
                        ))}
                    </div>
                ) : (
                    renderGrid([...gridSignals, ...unavailable])
                )
            ) : null}

            {note ? <div data-testid="area-overview-note">{note}</div> : null}
        </section>
    );
}
