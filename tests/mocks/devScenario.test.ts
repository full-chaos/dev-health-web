import { describe, expect, it } from "vitest";

import {
    buildStreamEvents,
    CLARIFICATION_COPY,
    NO_ANSWER_OUTCOMES,
    type DevAnswerScenario,
} from "./devScenario";

/**
 * Fixture-fidelity oracle for the Ask Dev mock (CHAOS-3219).
 *
 * The browser specs assert what the UI RENDERS. That cannot tell whether the
 * payload underneath is one production could actually produce — and a mock
 * that emits an impossible shape makes every test built on it worthless
 * while still passing. Two rounds of adversarial review found exactly that:
 * a clarification answer carrying `status: "complete"`, an `unresolved`
 * outcome beside a completed answer, and an organization-wide resolution
 * that still named one authorized repository.
 *
 * Comments claiming "this matches the projector" are not checkable. These
 * assertions are. Each one is keyed to the ops code path that produces the
 * shape, so a fixture edit that drifts from the projector fails here rather
 * than silently weakening the suite that depends on it.
 */
type JsonRecord = Record<string, unknown>;

function answerFor(scenario: DevAnswerScenario): JsonRecord {
    const events = buildStreamEvents(scenario, "conversation_test", "A question");
    const completed = events.find((event) => event.event === "answer.completed");
    expect(completed, `${scenario} produced no answer.completed event`).toBeDefined();
    return completed!.answer as JsonRecord;
}

function errorFor(scenario: DevAnswerScenario): JsonRecord {
    const events = buildStreamEvents(scenario, "conversation_test", "A question");
    const failed = events.find((event) => event.event === "error");
    expect(failed, `${scenario} produced no error event`).toBeDefined();
    return failed!.error as JsonRecord;
}

describe("Ask Dev mock fidelity — clarification projection", () => {
    // ops contracts_v2/compat.py `_project_needs_clarification`: status is
    // hard-coded INSUFFICIENT_EVIDENCE and claims/metrics/evidence/conflicts
    // are hard-coded empty. `needs_clarification` is one of
    // EMPTY_CONTENT_OUTCOMES; only `answered`/`answered_with_gaps` may carry
    // content.
    it("needs_clarification projects to insufficient_evidence with an ambiguous scope and no content", () => {
        const answer = answerFor("needs_clarification");
        expect(answer.status).toBe("insufficient_evidence");
        expect(answer.direct_summary).toBe(CLARIFICATION_COPY.ambiguous);
        expect(answer.claims).toEqual([]);
        expect(answer.metrics).toEqual([]);
        expect(answer.evidence).toEqual([]);

        const resolution = answer.resolved_scope as JsonRecord;
        expect(resolution.outcome).toBe("ambiguous");
        expect(resolution.resolved_scope).toBeNull();
        // AMBIGUOUS requires candidates (DevScopeResolution.validate_outcome_payload).
        expect((resolution.candidates as unknown[]).length).toBeGreaterThan(0);
    });

    // The no-candidates branch (compat.py:427) is the ONLY producer of an
    // `unresolved` scope row, and it carries the uninterpretable copy.
    it("scope_unresolved is the no-candidates clarification shape, not a completed answer", () => {
        const answer = answerFor("scope_unresolved");
        expect(answer.status).toBe("insufficient_evidence");
        expect(answer.direct_summary).toBe(CLARIFICATION_COPY.uninterpretable);
        expect(answer.claims).toEqual([]);
        expect(answer.metrics).toEqual([]);
        expect(answer.evidence).toEqual([]);

        const resolution = answer.resolved_scope as JsonRecord;
        expect(resolution.outcome).toBe("unresolved");
        expect(resolution.resolved_scope).toBeNull();
        expect(resolution.candidates).toEqual([]);
        // requested_scope comes from the same `_build_resolved_scope` call as
        // resolved (compat.py:404, :431), which with no subject is an
        // organization scope — not the caller's repository scope.
        const requested = resolution.requested_scope as JsonRecord;
        expect(requested.direct_scope).toBe("organization");
        expect(requested.repositories).toEqual([]);
        expect(requested.entity_refs).toEqual([]);
    });
});

describe("Ask Dev mock fidelity — organization fallback", () => {
    // `_build_resolved_scope` builds the no-subject scope from scratch with
    // exactly seven fields; `authorized_repository_ids` and
    // `authorized_entity_ids` are then derived FROM that scope
    // (compat.py:325-326). Every assertion here failed at some point during
    // review against a fixture that merely stamped the enum on.
    it("widens the whole resolution, not just the outcome enum", () => {
        const answer = answerFor("scope_organization_fallback");
        const resolution = answer.resolved_scope as JsonRecord;
        expect(resolution.outcome).toBe("organization_fallback");

        for (const key of ["resolved_scope", "requested_scope"] as const) {
            const scope = resolution[key] as JsonRecord;
            expect(scope.direct_scope, `${key}.direct_scope`).toBe("organization");
            expect(scope.repositories, `${key}.repositories`).toEqual([]);
            expect(scope.entity_refs, `${key}.entity_refs`).toEqual([]);
            expect(scope.team_ids, `${key}.team_ids`).toEqual([]);
            expect(scope.comparison_range, `${key}.comparison_range`).toBeNull();
            expect(scope.surface_context, `${key}.surface_context`).toBeNull();
        }

        // The rendered UI cannot catch these: `scopeCoverageLabel` returns
        // "Organization" for ANY non-repository scope and never reads the
        // authorization lists, so a browser assertion on the scope row is
        // vacuous here (codex adversarial review round 4). Assert the payload.
        expect(resolution.authorized_repository_ids).toEqual([]);
        expect(resolution.authorized_entity_ids).toEqual([]);

        // Claim validity has to widen with the scope too, or the answer
        // asserts organization-wide reach with repository-scoped grounding.
        for (const claim of answer.claims as JsonRecord[]) {
            expect((claim.validity_scope as JsonRecord).direct_scope).toBe("organization");
        }
    });
});

describe("Ask Dev mock fidelity — no-answer outcomes", () => {
    // These five never become a DevAnswer at all: the projector turns each
    // into a DevError whose code/retryable come from `_ERROR_OUTCOME_CODES`
    // and whose text comes from the server-owned canonical tables.
    for (const outcome of NO_ANSWER_OUTCOMES) {
        it(`${outcome.outcome} projects to a ${outcome.code} DevError, never an answer`, () => {
            const events = buildStreamEvents(outcome.scenario, "conversation_test", "A question");
            expect(events.some((event) => event.event === "answer.completed")).toBe(false);

            const error = errorFor(outcome.scenario);
            expect(error.code).toBe(outcome.code);
            expect(error.retryable).toBe(outcome.retryable);
            expect(error.safe_message).toBe(outcome.safeMessage);
            expect(error.remediation).toEqual([...outcome.remediation]);
        });
    }
});
