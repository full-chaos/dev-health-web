/**
 * CHAOS-3377 (codex adversarial web review, round 2): two MEDIUM findings
 * against the `STATUS_ASSESSMENT_TOKENS` denylist widening.
 *
 * 1. No effective drift/mutation guard. The original acceptance test fed
 *    already-TRANSLATED prose and asserted the raw tokens were absent from
 *    it -- true regardless of whether the denylist contains those tokens at
 *    all, so deleting the entire `STATUS_ASSESSMENT_TOKENS` array would
 *    leave that test green. This file's `EXPECTED_STATUS_TOKENS` is a
 *    hand-written LITERAL list, mirroring the same rule
 *    `AskDevAnswer.test.tsx`'s own `PRD_PROHIBITED_TOKENS` states for
 *    itself ("a control that imports its own expected string from the code
 *    it is checking cannot fail when that code is wrong") -- it must never
 *    import from `internalTokens.ts`. Every literal is INJECTED into a
 *    guarded field and the guard is asserted to actually catch it: removing
 *    any one token from the real denylist turns exactly that test red,
 *    because the literal a token would need to still be caught by lives
 *    here, independent of the array under test.
 *
 * 2. Substring collisions over-redacted legitimate text: `findInternalToken`
 *    used to do a bare case-insensitive `includes()` and replace the WHOLE
 *    field. `factual_completion.ts`, `cannot_ready`, and `prev1_state` all
 *    contain a denylisted token as a substring while being ordinary,
 *    legitimate identifiers. Fixed with word-boundary matching (plus a
 *    dedicated shape check for the `ev1_` evidence-handle prefix, which a
 *    plain `\bev1_\b` boundary can't correctly express -- a real handle
 *    continues with 40 more word characters immediately after the prefix).
 *
 * Source of truth for `EXPECTED_STATUS_TOKENS`: ops
 * `status_change_service.STATUS_REASON_CODES` (+ the `not_ready` completion
 * state and the `actual_completion` rule id), also published as the checked
 * -in artifact `contracts/ask-dev/v1/vocabulary/internal_prose_denylist.v1.json`.
 * KNOWN GAP (tracked, not silently accepted): this list is a manual snapshot
 * of that artifact, not yet pulled automatically the way
 * `scripts/ask-dev-contracts.mjs` pulls the JSON-schema artifacts from a
 * pinned ops commit -- ops CHAOS-3377 has not merged yet, so there is no
 * commit to pin to. Extending that script's existing pinned-source mechanism
 * to also sync `vocabulary/internal_prose_denylist.v1.json` (dropping this
 * hand-copied list in favor of a generated one) is the correct follow-up
 * once ops merges; until then, this file's list must be updated by hand
 * alongside any ops change to `STATUS_REASON_CODES`, and IS covered by the
 * effectiveness test below even though it cannot detect that specific
 * cross-repo drift on its own.
 */

import { describe, expect, it } from "vitest";

import { INTERNAL_TOKEN_DENYLIST } from "@/components/ask-dev/AskDevAnswer";
import { findInternalToken, safeCopy, WITHHELD_COPY } from "@/lib/dev/internalTokens";

const EXPECTED_STATUS_TOKENS = [
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
] as const;

describe("STATUS_ASSESSMENT_TOKENS coverage (CHAOS-3377 MEDIUM 1)", () => {
    it.each(EXPECTED_STATUS_TOKENS)(
        "the real denylist contains the literal token '%s'",
        (token) => {
            expect(INTERNAL_TOKEN_DENYLIST.has(token)).toBe(true);
        },
    );

    it.each(EXPECTED_STATUS_TOKENS)(
        "injecting '%s' into a guarded field is actually caught",
        (token) => {
            const text = `The assessment reported ${token} for this subject.`;
            expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBe(token);
            expect(safeCopy(text, INTERNAL_TOKEN_DENYLIST)).toBe(WITHHELD_COPY);
        },
    );

    it("catches a real evidence-handle shape (ev1_ + 40 hex chars)", () => {
        const handle = `ev1_${"a".repeat(40)}`;
        const text = `See ${handle} for detail.`;
        expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBe("ev1_");
        expect(safeCopy(text, INTERNAL_TOKEN_DENYLIST)).toBe(WITHHELD_COPY);
    });

    it("a token embedded at the very start or end of the field is still caught", () => {
        const [token] = EXPECTED_STATUS_TOKENS;
        expect(findInternalToken(`${token} is the reason.`, INTERNAL_TOKEN_DENYLIST)).toBe(token);
        expect(findInternalToken(`The reason is ${token}`, INTERNAL_TOKEN_DENYLIST)).toBe(token);
    });
});

describe("findInternalToken substring-collision negative controls (CHAOS-3377 MEDIUM 2)", () => {
    // Reviewer repros: each identifier CONTAINS a denylisted token as a
    // literal substring while being ordinary, legitimate text with no
    // internal-vocabulary leak in it at all.
    it.each([
        ["A file named factual_completion.ts was changed.", "actual_completion"],
        ["The check is cannot_ready until Friday.", "not_ready"],
        ["The variable prev1_state tracks the previous render.", "ev1_"],
    ])("'%s' is not flagged despite containing '%s' as a substring", (text) => {
        expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBeNull();
        expect(safeCopy(text, INTERNAL_TOKEN_DENYLIST)).toBe(text);
    });

    it("a longer identifier containing 'ev1_' followed by fewer than 40 hex chars is not flagged", () => {
        const text = `Reference ev1_${"a".repeat(10)} is not a real handle.`;
        expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBeNull();
    });

    it("a longer identifier containing 'ev1_' followed by non-hex characters is not flagged", () => {
        const text = `Config key ev1_${"z".repeat(40)} is unrelated.`;
        expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBeNull();
    });

    it("still catches a genuine leak in the SAME sentence as a substring collision", () => {
        // A sentence that contains BOTH an innocuous substring collision and
        // a genuine standalone leak must still fail on the real leak.
        const text = "factual_completion.ts references open_blocker directly.";
        expect(findInternalToken(text, INTERNAL_TOKEN_DENYLIST)).toBe("open_blocker");
    });
});
