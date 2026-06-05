/**
 * AI dominance gate (CHAOS-2051).
 *
 * Pure, framework-free predicate that decides whether AI is the *dominant*
 * signal on the cockpit. The cockpit "AI Workflow Intelligence" block is only
 * rendered prominently when this returns true; otherwise AI is reduced to a
 * single secondary link (AI remains reachable via PrimaryNav / the /ai area
 * regardless).
 *
 * Contract (finalized by cockpit-lead): `signals[]` is pre-sorted by dominance,
 * so index 0 is the top signal. There is no `weight` field, and the cockpit
 * `health_state` does not attribute a driving category. AI is dominant iff the
 * top signal's category is the AI category. Keep this pure and deterministic —
 * it is unit tested in isolation.
 */

/** The canonical category key used by the work graph for AI-attributed work. */
export const AI_CATEGORY = "ai" as const;

/** Structural subset of a cockpit signal that the gate reads. */
export type AiGateSignal = {
    category: string;
};

/** Structural input to {@link isAiDominant}. */
export type AiGateInput = {
    /** Pre-sorted by dominance; index 0 is the top signal. */
    signals?: readonly AiGateSignal[] | null;
};

/**
 * Returns the top (most dominant) signal, or `undefined` when there are none.
 * `signals` is contractually pre-sorted, so the top signal is index 0.
 */
export function topSignal(
    signals: readonly AiGateSignal[] | null | undefined,
): AiGateSignal | undefined {
    return signals && signals.length > 0 ? signals[0] : undefined;
}

/**
 * Is AI the dominant signal on the cockpit?
 *
 * True iff the top-ranked (index 0) signal's category is the AI category.
 * Returns false for empty / missing input — absence of evidence is never
 * treated as AI dominance.
 */
export function isAiDominant(input: AiGateInput | null | undefined): boolean {
    return topSignal(input?.signals)?.category === AI_CATEGORY;
}
