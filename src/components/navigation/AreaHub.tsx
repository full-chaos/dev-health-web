import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { groupByCluster, sortBySeverity } from "@/lib/areaSignals/sort";

import { AreaSignalCard } from "./AreaSignalCard";

// ── AreaHub ──────────────────────────────────────────────────────────────────
//
// Renders an area's sub-areas as severity-sorted SIGNAL CARDS on the area's
// landing page (Framework A2a: sub-areas surface as cards — metric + state —
// never passive links). Reads card metadata from the central nav config so the
// sidebar, active state, and landing cards can never drift apart (CHAOS-2073),
// and the resolved per-signal state/value from the `signals` prop.
//
// RSC pattern (CHAOS-2074): AreaHub is PRESENTATIONAL. The area landing RSC
// resolves the `AreaSignal[]` (via `getAreaSignals(areaId, filters)`) and passes
// it in. This keeps AreaHub free of data-fetching / test-mode concerns and
// trivially unit-testable, while the landing owns the one fetch. Phase 2 wires
// Diagnose / Improve resolvers behind the same `getAreaSignals` dispatcher; this
// component does not change.
//
// Rendering rules:
//   - Severity-sorted: critical > high > medium > low > neutral > unavailable
//     (unavailable always last), applied per cluster by `groupByCluster`.
//   - Grouped by cluster when any signal carries one (Govern: Quality / Risk
//     headers); flat grid otherwise (light areas degrade gracefully).
//   - The single top signal across the area is emphasized like RankedSignals.
//   - Unavailable signals render an inline DataState; demoted ones render
//     visually secondary — both handled inside AreaSignalCard.

type AreaHubProps = {
    areaId: NavAreaId;
    /** Resolved signals for this area (from the landing RSC via getAreaSignals). */
    signals: AreaSignal[];
    filters: MetricFilter;
    role?: string;
    /** Eyebrow label above the grid. Defaults to "<Area> area". */
    title?: string;
    /** Optional one-line description under the eyebrow. */
    description?: string;
};

export function AreaHub({ areaId, signals, filters, role, title, description }: AreaHubProps) {
    const area = getAreaById(areaId);
    if (!area || signals.length === 0) return null;

    const clusters = groupByCluster(signals);
    const isClustered = clusters.some((group) => group.cluster != null);

    // The single most-severe *severity-bearing* signal across the WHOLE area gets
    // the emphasized treatment — sorted globally so a critical in a later cluster
    // still wins over a high in an earlier one. Identified by id so it renders
    // emphasized exactly once wherever it falls. Neutral (navigational) and
    // unavailable cards never claim the emphasized "top signal" slot.
    const SEVERITY_STATES = new Set(["critical", "high", "medium", "low"]);
    const [topSignal] = sortBySeverity(
        signals.filter((signal) => SEVERITY_STATES.has(signal.state)),
    );
    const topSignalId = topSignal?.id;

    return (
        <section
            aria-label={`${area.label} signals`}
            data-testid="area-hub"
            className="rounded-3xl border border-(--border) bg-(--card-80) p-5"
        >
            <div>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    {title ?? `${area.label} area`}
                </p>
                {description ? (
                    <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
                ) : null}
            </div>

            <div className="mt-4 space-y-6">
                {clusters.map((group) => (
                    <div
                        key={group.cluster ?? "_flat"}
                        data-testid="area-hub-cluster"
                        data-cluster={group.cluster ?? ""}
                    >
                        {isClustered && group.cluster ? (
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                                {group.cluster}
                            </p>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {group.signals.map((signal) => (
                                <AreaSignalCard
                                    key={signal.id}
                                    signal={signal}
                                    filters={filters}
                                    role={role}
                                    emphasized={signal.id === topSignalId}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
