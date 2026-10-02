"use client";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal } from "@/lib/types";

import { CockpitEmptyState } from "./CockpitEmptyState";
import { SignalCard } from "./SignalCard";

export type RankedSignalsProps = {
    /** Already-ranked signals (top first) from the enriched HomeResponse. */
    signals: CockpitSignal[];
    /** Active metric filter, forwarded to the evidence drawer for Explore links. */
    filters: MetricFilter;
};

/**
 * Ranked cockpit signals (CHAOS-2050).
 *
 * Renders the already-ranked `signals[]` in order with the top signal
 * emphasized. Every card opens the shared evidence drawer (`useEvidenceDrawer`) via
 * `signal.evidence_ref` (apiUrl).
 *
 * Empty `signals[]` renders the trust-preserving `CockpitEmptyState`
 * ("no-findings") rather than implying a clean bill of health.
 */
export function RankedSignals({ signals, filters }: RankedSignalsProps) {
    const evidence = useEvidenceDrawer();

    const openPanel = (title: string, params: { apiUrl?: string; metric?: string }) =>
        evidence.open({ title, ...params, filters });

    return (
        <section data-testid="ranked-signals" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Ranked signals
                    </p>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Ordered by severity and confidence for the selected window.
                    </p>
                </div>
            </div>

            {signals.length === 0 ? (
                <CockpitEmptyState variant="no-findings" data-testid="ranked-signals-empty" />
            ) : (
                <div className="space-y-4">
                    <SignalCard signal={signals[0]} emphasized onOpenEvidence={openPanel} />
                    {signals.length > 1 && (
                        <div className="grid gap-4 md:grid-cols-2">
                            {signals.slice(1).map((signal) => (
                                <SignalCard
                                    key={signal.id}
                                    signal={signal}
                                    onOpenEvidence={openPanel}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
