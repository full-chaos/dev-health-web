/**
 * The render-time half of the CHAOS-3367 copy contract.
 *
 * ops/src/dev_health_ops/api/dev/no_match_terminal.py fails a terminal closed
 * when a user-visible string carries an internal vocabulary token. This is the
 * same rule at the last layer before a human reads it: the server owns most of
 * that copy, but `direct_summary`, `claims[].text`, `warnings[]` and
 * `conflicts[].summary` are model-authored, and a client that renders whatever
 * arrives has no defence if a producer regresses or an older run is replayed
 * from persistence (rows written before the server-side check existed are not
 * rewritten by it).
 *
 * The token list is DERIVED, not hand-written. `ANSWER_STATUS_LABELS` and
 * `SCOPE_OUTCOME_LABELS` in AskDevAnswer.tsx are TOTAL `Record`s over the
 * generated unions -- a member added to either fails to compile until it is
 * added there -- so taking `Object.keys()` of them gives a runtime list that
 * cannot silently fall behind the wire contract.
 *
 * Only underscore-bearing members are kept, matching the server: `exact`,
 * `denied` and `failed` are ordinary English that safe prose may contain,
 * while `forbidden_or_not_found` and `scope_forbidden` cannot occur in written
 * English at all. That is what keeps the check free of false positives without
 * an exclusion list.
 */

/**
 * Internal token vocabularies that have no total `Record` in the component
 * layer to derive from. Kept minimal and pinned by a test against the schema's
 * own `dev_error.v1` code enum, so drift is a test failure rather than a
 * silent gap.
 */
const DEV_ERROR_CODE_TOKENS: readonly string[] = [
    "answer_validation_failed",
    "byo_llm_not_enabled",
    "concurrency_limited",
    "conversation_expired",
    "conversation_not_found",
    "cost_limit_reached",
    "feature_not_enabled",
    "insufficient_evidence",
    "internal_error",
    "invalid_request",
    "model_not_supported",
    "provider_contract_violation",
    "provider_not_configured",
    "provider_unavailable",
    "rate_limited",
    "scope_ambiguous",
    "scope_forbidden",
    "scope_not_found",
    "source_unavailable",
    "tool_limit_reached",
    "tool_unavailable",
];

export function buildInternalTokenDenylist(
    ...vocabularies: readonly (readonly string[])[]
): ReadonlySet<string> {
    return new Set(
        [...vocabularies, DEV_ERROR_CODE_TOKENS].flat().filter((token) => token.includes("_")),
    );
}

/**
 * The first denylisted token found in `value`, or `null`.
 *
 * Case-insensitive and substring-based: the reported live defect rendered
 * `forbidden_or_not_found` in the middle of a sentence, so an equality check
 * against the whole field would not have seen it.
 *
 * `attested` is the provenance escape hatch, mirroring ops
 * `no_match_terminal.internal_token_leak`. Some denylisted tokens are also
 * plausible real names — an authorized repository can genuinely be called
 * `not_found`, and a claim can genuinely mention `app/not_found.tsx`. Without
 * it, this guard would blank a healthy answer's own content. A token is
 * suppressed only when nothing this answer already carries as an authorized
 * label contains it; the exemption is per token, so a sentence mixing an
 * attested name with a real leak still fails on the leak.
 */
export function findInternalToken(
    value: string | null | undefined,
    denylist: ReadonlySet<string>,
    attested = "",
): string | null {
    if (!value) return null;
    const lowered = value.toLowerCase();
    const attestedText = attested.toLowerCase();
    for (const token of denylist) {
        if (lowered.includes(token) && !attestedText.includes(token)) return token;
    }
    return null;
}

/**
 * Copy substituted for a string that carries an internal token.
 *
 * A neutral replacement rather than a redaction of the token alone: a sentence
 * built around a leaked enum does not become true when the enum is removed
 * from it ("Scope resolution returned ." is not an improvement), and it must
 * not read as a claim the server never made.
 */
export const WITHHELD_COPY = "This part of the answer could not be shown.";

export function safeCopy(
    value: string | null | undefined,
    denylist: ReadonlySet<string>,
    attested = "",
): string {
    if (!value) return "";
    return findInternalToken(value, denylist, attested) === null ? value : WITHHELD_COPY;
}
