"use client";

import type {
	CockpitSignal,
	ConfidenceLevel,
	SignalDirection,
	SignalSeverity,
} from "@/lib/types";

/**
 * Cockpit signal card (CHAOS-2050).
 *
 * Renders a single ranked cockpit signal with the four required encodings
 * (severity + confidence + affected scope + evidence count), the
 * current/prior/delta display values with direction, the plain-language
 * "why it matters", and an explicit recommended-action CTA. Every card opens a
 * populated EvidencePanel via `signal.evidence_ref`.
 *
 * Consumes the canonical `CockpitSignal` from `@/lib/types` — values
 * (`current_value`, `prior_value`, `delta`) are backend-formatted display
 * strings, so no client-side numeric formatting is applied here.
 */

/** Callback into the panel owner (RankedSignals / cockpit-lead's CockpitClient). */
export type OpenEvidence = (
	title: string,
	params: { apiUrl?: string; metric?: string },
) => void;

export type SignalCardProps = {
	signal: CockpitSignal;
	/** When true, render the emphasized "top signal" treatment. */
	emphasized?: boolean;
	onOpenEvidence: OpenEvidence;
};

const SEVERITY_BADGE: Record<SignalSeverity, string> = {
	critical: "border-red-500/30 bg-red-500/15 text-red-300",
	high: "border-amber-500/30 bg-amber-500/15 text-amber-300",
	medium: "border-(--accent-2)/30 bg-(--accent-2)/12 text-(--accent-2)",
	low: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

const SEVERITY_LABEL: Record<SignalSeverity, string> = {
	critical: "Critical",
	high: "High",
	medium: "Medium",
	low: "Low",
};

const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
	high: "bg-(--accent-3)",
	medium: "bg-amber-400",
	low: "bg-(--ink-muted)",
};

const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
	high: "text-(--accent-3)",
	medium: "text-amber-300",
	low: "text-(--ink-muted)",
};

const DIRECTION_GLYPH: Record<SignalDirection, string> = {
	up: "↑",
	down: "↓",
	flat: "→",
};

const directionAccent = (direction: SignalDirection) =>
	direction === "up"
		? "text-(--accent-3)"
		: direction === "down"
			? "text-(--accent-negative)"
			: "text-(--ink-muted)";

export function SignalCard({
	signal,
	emphasized = false,
	onOpenEvidence,
}: SignalCardProps) {
	const open = () =>
		onOpenEvidence(signal.title, { apiUrl: signal.evidence_ref || undefined });

	const hasPrior = signal.prior_value != null && signal.prior_value !== "";

	return (
		<article
			data-testid="signal-card"
			data-severity={signal.severity}
			data-confidence={signal.confidence}
			data-direction={signal.direction}
			data-category={signal.category}
			data-emphasized={emphasized ? "true" : "false"}
			className={
				emphasized
					? "relative overflow-hidden rounded-3xl border border-(--accent)/30 bg-gradient-to-br from-(--card) to-(--card-80) p-6 shadow-lg ring-1 ring-(--accent)/10"
					: "relative overflow-hidden rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
			}
		>
			{emphasized && (
				<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
					Top signal
				</p>
			)}

			{/* Title + severity badge */}
			<header className="mt-1 flex items-start justify-between gap-3">
				<h3
					className={
						emphasized
							? "font-(--font-display) text-2xl leading-tight text-foreground"
							: "font-(--font-display) text-lg leading-tight text-foreground"
					}
				>
					{signal.title}
				</h3>
				<span
					data-testid="signal-severity"
					className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${SEVERITY_BADGE[signal.severity]}`}
				>
					{SEVERITY_LABEL[signal.severity]}
				</span>
			</header>

			{/* Current / prior / delta + direction */}
			<div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					data-testid="signal-current"
					className="metric-hero text-3xl font-semibold text-foreground"
				>
					{signal.current_value}
				</span>
				{signal.delta ? (
					<span
						data-testid="signal-delta"
						className={`flex items-center gap-1 text-sm font-medium ${directionAccent(signal.direction)}`}
					>
						<span aria-hidden>{DIRECTION_GLYPH[signal.direction]}</span>
						{signal.delta}
					</span>
				) : null}
				{hasPrior ? (
					<span className="text-xs text-(--ink-muted)">
						from {signal.prior_value} prior
					</span>
				) : (
					<span className="text-xs text-(--ink-muted)">no prior period</span>
				)}
			</div>

			{/* The four required encodings: severity (above) + confidence, scope, evidence count */}
			<div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
				<span
					data-testid="signal-confidence"
					className={`inline-flex items-center gap-1.5 rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 font-medium uppercase tracking-[0.12em] ${CONFIDENCE_TEXT[signal.confidence]}`}
				>
					<span
						className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[signal.confidence]}`}
					/>
					{signal.confidence} confidence
				</span>
				<span
					data-testid="signal-scope"
					className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 text-(--ink-muted)"
				>
					{signal.affected_scope}
				</span>
				<span
					data-testid="signal-evidence-count"
					className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 text-(--ink-muted)"
				>
					{signal.evidence_count}{" "}
					{signal.evidence_count === 1 ? "artifact" : "artifacts"}
				</span>
			</div>

			{/* Why it matters */}
			<p
				data-testid="signal-why"
				className="mt-4 text-sm leading-6 text-(--ink-muted)"
			>
				{signal.why_it_matters}
			</p>

			{/* Recommended action — explicit, not buried in the drawer */}
			<div
				data-testid="signal-recommended-action"
				className="mt-4 rounded-2xl border border-(--accent)/20 bg-(--accent)/8 p-3"
			>
				<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
					Recommended action
				</p>
				<p className="mt-1 text-sm leading-5 text-foreground">
					{signal.recommended_action}
				</p>
			</div>

			{/* Evidence affordance */}
			<button
				type="button"
				data-testid="signal-open-evidence"
				onClick={open}
				className="mt-4 flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.18em] text-(--ink-muted) transition-colors hover:border-(--accent)/40 hover:bg-(--accent)/10 hover:text-(--accent)"
			>
				Open evidence
				<span aria-hidden>↗</span>
			</button>
		</article>
	);
}
