/**
 * AI dominance gate (CHAOS-2051).
 *
 * Pure, framework-free predicate that decides whether AI is the *dominant*
 * signal on the cockpit. The cockpit "AI Workflow Intelligence" block is only
 * rendered prominently when this returns true; otherwise AI is reduced to a
 * single secondary link (AI remains reachable via PrimaryNav / the /ai area
 * regardless).
 *
 * This module is intentionally decoupled from React and from the exact named
 * contract types. It reads only the structural subset it needs, so the cockpit
 * `health_state` and `signals[]` contract types (from `@/lib/types`) satisfy
 * these parameter shapes without a hard import coupling. Keep it pure and
 * deterministic — it is unit tested in isolation.
 */

/** The canonical category key used by the work graph for AI-attributed work. */
export const AI_CATEGORY = "ai" as const;

/** Structural subset of a cockpit signal that the gate reads. */
export type AiGateSignal = {
	category: string;
	/**
	 * Optional ranking weight/score. When present on any signal, the gate ranks
	 * by it (highest wins, ties broken by array order). When absent everywhere,
	 * the gate treats the array as pre-sorted (index 0 is the top signal).
	 */
	weight?: number | null;
};

/** Structural subset of the cockpit health state that the gate reads. */
export type AiGateHealthState = {
	/**
	 * The signal category that is currently driving the overall health state, if
	 * the backend attributes one. When this equals {@link AI_CATEGORY}, AI is
	 * considered dominant regardless of the signal ranking.
	 */
	driver_category?: string | null;
};

/** Structural input to {@link isAiDominant}. */
export type AiGateInput = {
	signals?: readonly AiGateSignal[] | null;
	health_state?: AiGateHealthState | null;
};

/**
 * Returns the single top-ranked signal, or `undefined` when there are none.
 *
 * Ranking rule:
 * - If any signal carries a numeric `weight`, the highest weight wins. Signals
 *   without a weight are treated as `-Infinity` so an explicit weight always
 *   outranks an unweighted one. Ties resolve to the earliest array index.
 * - If no signal carries a weight, the array is assumed pre-sorted and index 0
 *   is returned.
 */
export function topSignal(
	signals: readonly AiGateSignal[] | null | undefined,
): AiGateSignal | undefined {
	if (!signals || signals.length === 0) {
		return undefined;
	}

	const hasWeights = signals.some(
		(s) => typeof s.weight === "number" && Number.isFinite(s.weight),
	);
	if (!hasWeights) {
		return signals[0];
	}

	let best = signals[0];
	let bestWeight =
		typeof best.weight === "number" && Number.isFinite(best.weight)
			? best.weight
			: -Infinity;
	for (let i = 1; i < signals.length; i++) {
		const candidate = signals[i];
		const weight =
			typeof candidate.weight === "number" && Number.isFinite(candidate.weight)
				? candidate.weight
				: -Infinity;
		if (weight > bestWeight) {
			best = candidate;
			bestWeight = weight;
		}
	}
	return best;
}

/**
 * Is AI the dominant signal on the cockpit?
 *
 * True when EITHER:
 *  1. the health state is explicitly driven by the AI category, OR
 *  2. the top-ranked signal's category is the AI category.
 *
 * Returns false for empty / missing input — absence of evidence is never
 * treated as AI dominance.
 */
export function isAiDominant(input: AiGateInput | null | undefined): boolean {
	if (!input) {
		return false;
	}

	const driver = input.health_state?.driver_category;
	if (typeof driver === "string" && driver.toLowerCase() === AI_CATEGORY) {
		return true;
	}

	const top = topSignal(input.signals);
	if (
		top &&
		typeof top.category === "string" &&
		top.category.toLowerCase() === AI_CATEGORY
	) {
		return true;
	}

	return false;
}
