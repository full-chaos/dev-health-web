import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { isAvailable, sortBySeverity } from "@/lib/areaSignals/sort";

import { AreaSignalCard } from "./AreaSignalCard";

// ── AreaOverview (CHAOS-2082) ─────────────────────────────────────────────────
//
// The ONE shared Overview contract for every decision area (Framework A2a:
// "summarize + route, never duplicate child workflows"). Govern / Diagnose /
// Improve adopt it now; Plan / AI adopt it as they land (J4 / J7).
//
// Contract:
//   - ONE top-signal hero: the single most-severe available sub-area, rendered
//     with `AreaSignalCard`'s emphasized treatment.
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
    /** Eyebrow label above the hero. Defaults to "<Area> area". */
    title?: string;
    /** Optional one-line description under the eyebrow. */
    description?: string;
};

export function AreaOverview({
    areaId,
    signals,
    filters,
    role,
    title,
    description,
}: AreaOverviewProps) {
    const area = getAreaById(areaId);
    if (!area) return null;

    // Real-data signals sort by severity; empty / unconnected sub-areas sink to
    // the muted tier at the bottom. Partitioning here (not just sorting) keeps the
    // hero selection honest — an unavailable metric is never "the top signal".
    const available = sortBySeverity(signals.filter(isAvailable));
    const unavailable = signals.filter((signal) => !isAvailable(signal));

    const [candidateHero, ...restAvailable] = available;
    const candidateHeroIsActionable =
        candidateHero &&
        (candidateHero.id === "improve-top-signal" ||
            !["low", "neutral"].includes(candidateHero.state));
    const hero = candidateHeroIsActionable ? candidateHero : undefined;

    const gridSignals = hero ? restAvailable : available;

    if (!hero && gridSignals.length === 0 && unavailable.length === 0) return null;

    return (
        <section
            aria-label={`${area.label} overview`}
            data-testid="area-overview"
            className="flex flex-col gap-6"
        >
            <div>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    {title ?? `${area.label} area`}
                </p>
                {description ? (
                    <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
                ) : null}
            </div>

            {hero ? (
                <div data-testid="area-overview-hero">
                    <AreaSignalCard signal={hero} filters={filters} role={role} emphasized />
                </div>
            ) : null}

            {gridSignals.length > 0 || unavailable.length > 0 ? (
                <div
                    data-testid="area-overview-grid"
                    className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
                >
                    {gridSignals.map((signal) => (
                        <AreaSignalCard
                            key={signal.id}
                            signal={signal}
                            filters={filters}
                            role={role}
                        />
                    ))}
                    {unavailable.map((signal) => (
                        <AreaSignalCard
                            key={signal.id}
                            signal={signal}
                            filters={filters}
                            role={role}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
