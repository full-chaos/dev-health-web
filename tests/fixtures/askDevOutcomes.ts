import type { AnswerStatus } from "./askDevContracts";

/**
 * CHAOS-3287: single source of truth for "what does each Ask Dev outcome
 * scenario mean" — both the mock server (tests/mocks/devScenario.ts, which
 * builds the canned dev_answer.v1 payload) and the specs
 * (tests/ask-dev-outcomes.spec.ts, which assert on the rendered result)
 * read from this same table instead of each hand-duplicating the
 * status/copy pairing.
 *
 * This is deliberately the ONLY place that maps a scenario key to a
 * dev_answer.v1 `status` + expected copy. When CHAOS-3298 re-pins the web
 * client to dev_answer.v2's public-outcome taxonomy (answered,
 * answered_with_gaps, needs_clarification, not_found,
 * temporarily_unavailable, unsupported, denied, failed), only this table
 * (and the two functions in devScenario.ts that read it) should need to
 * change — the spec files loop over it rather than hardcoding per-status
 * assertions.
 */
export type AskDevOutcomeCase = Readonly<{
    /** Scenario key used in the `[[ask-dev:<key>]]` question marker. */
    key: string;
    /** The dev_answer.v1 `status` this scenario's canned answer carries. */
    status: AnswerStatus;
    /** Substring asserted present in `answer.direct_summary`. */
    directSummary: string;
    /**
     * Substring asserted present in AskDevAnswer's STATUS_EXPLANATIONS
     * caption, or null for the one status (`complete`) that has none.
     */
    captionContains: string | null;
    /** True when this scenario's canned answer carries zero evidence/metrics/claims. */
    emptyEvidence?: boolean;
}>;

export const ASK_DEV_OUTCOME_TABLE: readonly AskDevOutcomeCase[] = [
    {
        key: "complete",
        status: "complete",
        directSummary: "Twelve work items completed in the selected period.",
        captionContains: null,
    },
    {
        key: "partial",
        status: "partial",
        directSummary:
            "Nine of twelve required sources answered; three sources were unavailable for this window.",
        captionContains: "the investigation did not fully complete",
    },
    {
        key: "degraded",
        status: "degraded",
        directSummary:
            "The investigation completed with degraded evidence: one required source returned stale data.",
        captionContains: "could not complete as expected",
    },
    {
        key: "insufficient_evidence",
        status: "insufficient_evidence",
        directSummary: "There isn't enough evidence in this scope to answer with confidence.",
        captionContains: "isn't enough evidence",
        emptyEvidence: true,
    },
    {
        key: "refused",
        status: "refused",
        directSummary: "Ask Dev did not answer this question.",
        captionContains: "did not answer this question",
        emptyEvidence: true,
    },
] as const;

export function outcomeCase(key: string): AskDevOutcomeCase {
    const found = ASK_DEV_OUTCOME_TABLE.find((entry) => entry.key === key);
    if (!found) throw new Error(`No ASK_DEV_OUTCOME_TABLE entry for scenario "${key}"`);
    return found;
}
