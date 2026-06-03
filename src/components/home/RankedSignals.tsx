"use client";

import { useState } from "react";

import { EvidencePanel } from "@/components/evidence";
import type { MetricFilter } from "@/lib/filters/types";
import type { CockpitSignal } from "@/lib/types";

import { CockpitEmptyState } from "./CockpitEmptyState";
import { SignalCard } from "./SignalCard";

export type RankedSignalsProps = {
	/** Already-ranked signals (top first) from the enriched HomeResponse. */
	signals: CockpitSignal[];
	/** Active metric filter, forwarded to the EvidencePanel for Explore links. */
	filters: MetricFilter;
};

type PanelState = {
	isOpen: boolean;
	title: string;
	apiUrl?: string;
	metric?: string;
};

/**
 * Ranked cockpit signals (CHAOS-2050).
 *
 * Renders the already-ranked `signals[]` in order with the top signal
 * emphasized. Self-owns its EvidencePanel so the component is independently
 * testable and trivially integratable — cockpit-lead drops
 * `<RankedSignals signals={home.signals} filters={filters} />` into the cockpit.
 * Every card opens a populated EvidencePanel via `signal.evidence_ref` (apiUrl).
 *
 * Empty `signals[]` renders the trust-preserving `CockpitEmptyState`
 * ("no-findings") rather than implying a clean bill of health.
 */
export function RankedSignals({ signals, filters }: RankedSignalsProps) {
	const [panel, setPanel] = useState<PanelState>({ isOpen: false, title: "" });

	const openPanel = (
		title: string,
		params: { apiUrl?: string; metric?: string },
	) => setPanel({ isOpen: true, title, ...params });

	const closePanel = () => setPanel((prev) => ({ ...prev, isOpen: false }));

	return (
		<section data-testid="ranked-signals" className="space-y-4">
			<EvidencePanel
				isOpen={panel.isOpen}
				onCloseAction={closePanel}
				title={panel.title}
				apiUrl={panel.apiUrl}
				metric={panel.metric}
				filters={filters}
			/>

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
				<CockpitEmptyState
					variant="no-findings"
					data-testid="ranked-signals-empty"
				/>
			) : (
				<div className="space-y-4">
					<SignalCard
						signal={signals[0]}
						emphasized
						onOpenEvidence={openPanel}
					/>
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
