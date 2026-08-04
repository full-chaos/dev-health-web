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

/**
 * CHAOS-3377 defect 2: the `dev_status_snapshot`/`ActualCompletion` internal
 * vocabulary -- the completion `state` Literal plus every reason code
 * `status_change_service._assess` can emit (ops
 * `status_change_service.STATUS_REASON_CODES` / `status_completion_copy.py`
 * is the source of truth this list mirrors; kept in sync by
 * `AskDevAnswer.test.tsx`'s totality test against the PRD's literal
 * prohibited strings, the same way `DEV_ERROR_CODE_TOKENS` above is pinned).
 *
 * Ops now server-renders this vocabulary through a closed translation table
 * before it ever reaches `dev_answer.v1` (`status_answer_render.py`), so a
 * NEW run cannot leak these. This list is the client-side backstop for an
 * already-persisted or replayed row written before that fix existed --
 * mirrors `no_match_terminal.py`'s own read-time `redact_persisted_answer`
 * rationale for the CHAOS-3367 scope-resolution vocabulary.
 *
 * `"ev1_"` is not a StrEnum member but an evidence-handle PREFIX
 * (`ev1_<40 hex>`, ops `contracts_v2/base.py`); included directly since the
 * substring-based scan below matches a prefix exactly the same way it
 * matches a whole token.
 */
const STATUS_ASSESSMENT_TOKENS: readonly string[] = [
    "actual_completion",
    "not_ready",
    "child_requirement_unknown",
    "declared_status_missing",
    "required_source_not_fresh",
    "assessment_source_limit_reached",
    "required_release_evidence_missing",
    "required_child_incomplete",
    "open_blocker",
    "required_pull_request_unmerged",
    "required_review_unresolved",
    "review_changes_requested",
    "ci_requirement_unknown",
    "required_ci_skip_state_unknown",
    "required_ci_work_skipped",
    "required_ci_not_passing",
    "required_deployment_not_succeeded",
    "active_blocking_incident",
    "ev1_",
];

/**
 * Tokens no provenance may ever exempt, mirroring ops
 * `no_match_terminal.NEVER_ATTESTABLE_TOKENS`.
 *
 * Left unbounded, `attested` was itself a hole: an evidence label named
 * `scope_forbidden` would exempt a genuinely leaked `scope_forbidden` anywhere
 * else in the same answer. These tokens describe Ask Dev's own scope-resolution
 * decision — an entity cannot plausibly be named after one, and they are
 * exactly what PRD §12 prohibits by name — so the escape hatch does not apply
 * to them at all.
 */
export const NEVER_ATTESTABLE_TOKENS: ReadonlySet<string> = new Set([
    "forbidden_or_not_found",
    "organization_fallback",
    "scope_ambiguous",
    "scope_forbidden",
    "scope_not_found",
]);

export function buildInternalTokenDenylist(
    ...vocabularies: readonly (readonly string[])[]
): ReadonlySet<string> {
    return new Set(
        [...vocabularies, DEV_ERROR_CODE_TOKENS, STATUS_ASSESSMENT_TOKENS]
            .flat()
            .filter((token) => token.includes("_")),
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
        if (!lowered.includes(token)) continue;
        if (NEVER_ATTESTABLE_TOKENS.has(token) || !attestedText.includes(token)) return token;
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
