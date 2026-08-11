import { describe, expect, it } from "vitest";

import {
    applyMessage,
    buildStreamEvents,
    CLARIFICATION_COPY,
    createConversation,
    getTranscript,
    NO_ANSWER_OUTCOMES,
    parseScenario,
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

describe("Ask Dev mock fidelity — graph assistance rendering scenario", () => {
    it("selects the scenario marker and applies production state precedence", () => {
        expect(parseScenario("[[ask-dev:graph_assisted]] Show the drivers")).toEqual({
            scenario: "graph_assisted",
            visibleQuestion: "Show the drivers",
        });

        const answer = answerFor("graph_assisted");
        const graphAssisted = answer.graph_assisted as JsonRecord;
        expect(graphAssisted.schema_version).toBe("dev_answer_graph_assistance.v1");
        expect(graphAssisted.state).toBe("truncated");
        const cohort = graphAssisted.cohort as JsonRecord;
        expect(cohort.members).toEqual([
            {
                display_label: "Platform",
                entity_id: "team_platform",
                inclusion_basis: "team_pressure",
                disposition: "unknown",
                pressure_dimensions: ["cognitive_workload_pressure"],
                rank: 1,
                signals: [
                    {
                        attribution_present: false,
                        coverage: 0.4,
                        data_semantics: "no_data",
                        denominator_present: false,
                        dimension: "cognitive_workload_pressure",
                        evidence_source_classes: ["cognitive_load"],
                        observed_states: ["available_stale"],
                        signal_id: "health:stale_capacity",
                        source: "health",
                        state: "unknown",
                    },
                    {
                        coverage: 0.4,
                        data_semantics: "measured_zero",
                        freshness: "stale",
                        observed_states: ["available_stale"],
                        signal_id: "metrics:metric:0123456789abcdef0123456789abcdef",
                        source: "metrics",
                    },
                    {
                        data_semantics: "no_data",
                        gap: "no_data",
                        observed_states: ["available_unknown"],
                        signal_id: "status",
                        source: "status",
                    },
                ],
            },
        ]);
        expect((cohort.members as JsonRecord[])[0]?.rank).toBe(1);
        expect((cohort.members as JsonRecord[])[0]?.disposition).toBe("unknown");
        expect(((cohort.members as JsonRecord[])[0]?.signals as JsonRecord[])[0]?.source).toBe(
            "health",
        );
        expect(graphAssisted.ranked_drivers).toEqual([
            expect.objectContaining({
                category: "delivery_pressure",
                confidence: "qualified",
                conflicting_evidence_ref_ids: ["ev_02"],
                contribution: null,
                rank: 1,
                relevance: "current",
                role: "driver",
                standing: "principal_driver",
            }),
            expect.objectContaining({
                category: "dependency_pressure",
                freshness: "stale",
                rank: 2,
                standing: "contributing_driver",
            }),
            expect.objectContaining({
                exclusion_reason: "symptom_of_another_candidate",
                rank: 3,
                role: "symptom",
                standing: "excluded",
                withheld_reason: "evidence_unavailable",
            }),
        ]);
        expect(graphAssisted.evidence_lineage).toEqual([]);
        expect(answer.status).toBe("degraded");

        const evidenceIds = new Set(
            (answer.evidence as JsonRecord[]).map((item) => item.evidence_ref_id),
        );
        expect(evidenceIds).toContain("ev_01");
        expect(evidenceIds).toContain("ev_02");
    });

    it("keeps the test-only scenario marker out of the customer-visible title", () => {
        const conversation = createConversation(
            {},
            "[[ask-dev:graph_assisted]] Which teams need attention?",
        );

        expect(conversation.title).toBe("Which teams need attention?");

        const conversationId = String(conversation.conversation_id);
        applyMessage(
            conversationId,
            "client-message-graph",
            "[[ask-dev:graph_assisted]] Which teams need attention?",
            {},
            null,
        );
        const transcript = getTranscript(conversationId);
        expect((transcript?.items as JsonRecord[])[0].question).toBe("Which teams need attention?");
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

describe("Ask Dev mock fidelity — scope.resolved on error terminals (CHAOS-3526)", () => {
    // CHAOS-3497 (ops `streaming.stream_orchestrator`): a `scope.resolved`
    // frame is emitted for EVERY terminal whose run got as far as completing
    // scope resolution -- not only the answering ones -- immediately before
    // the terminal frame. Before this fix the mock never emitted it on an
    // error path at all, so the default e2e suite exercised a stream shape
    // production no longer produces.
    //
    // Which outcome each scenario carries is pinned against the ops
    // acceptance corpus's own `resolution-profiles/deterministic-v1.json`
    // (`expected_public_outcome` -> `expected_scope_resolution_outcome`),
    // the real producer's own recorded mapping, not an invented one:
    //   not_found              -> unresolved
    //   temporarily_unavailable -> exact
    //   unsupported            -> null (no scope.resolved at all)
    //   denied                 -> null (no scope.resolved at all)
    //   failed                 -> exact
    // `unsupported`/`denied` are refused before any catalog round trip (a
    // preflight bound, or a provider-level refusal) -- the run never
    // resolves scope at all, so publishing a resolution for either would be
    // inventing one the run never reached (`streaming.py`'s own negative
    // control: "a run that never resolved scope emits no scope frame").
    const SCOPE_RESOLUTION_BY_OUTCOME: Record<
        (typeof NO_ANSWER_OUTCOMES)[number]["outcome"],
        string | null
    > = {
        not_found: "unresolved",
        temporarily_unavailable: "exact",
        unsupported: null,
        denied: null,
        failed: "exact",
    };

    function eventsFor(scenario: DevAnswerScenario) {
        return buildStreamEvents(scenario, "conversation_test", "A question");
    }

    for (const outcome of NO_ANSWER_OUTCOMES) {
        const expected = SCOPE_RESOLUTION_BY_OUTCOME[outcome.outcome];
        if (expected === null) {
            it(`${outcome.outcome} emits no scope.resolved event (scope was never resolved)`, () => {
                const events = eventsFor(outcome.scenario);
                expect(events.some((event) => event.event === "scope.resolved")).toBe(false);
            });
            continue;
        }
        it(`${outcome.outcome} emits scope.resolved (${expected}) immediately before the error frame`, () => {
            const events = eventsFor(outcome.scenario);
            const kinds = events.map((event) => event.event);
            const scopeIndex = kinds.indexOf("scope.resolved");
            const errorIndex = kinds.indexOf("error");

            expect(scopeIndex, "no scope.resolved event was emitted").toBeGreaterThanOrEqual(0);
            expect(errorIndex).toBe(scopeIndex + 1);
            expect(kinds.slice(-2)).toEqual(["error", "done"]);
            expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));

            const resolution = events[scopeIndex]!.scope_resolution as JsonRecord;
            expect(resolution.schema_version).toBe("dev_scope_resolution.v1");
            expect(resolution.outcome).toBe(expected);
            if (expected === "unresolved") {
                expect(resolution.resolved_scope).toBeNull();
                expect(resolution.candidates).toEqual([]);
            } else {
                expect(resolution.resolved_scope).not.toBeNull();
            }
        });
    }

    // `scope_forbidden_error` / `source_unavailable_error` are hand-built
    // (not part of `NO_ANSWER_OUTCOMES`), mirroring the top-level
    // `orchestrator.run()` resolve-outcome branch and the stream-level
    // source-unavailable shape respectively. `scope_forbidden` carries
    // `forbidden_or_not_found` -- the same "genuinely unhealthy" outcome
    // CHAOS-3497 uses elsewhere, never a healthy `exact` beside a "you don't
    // have access" error (the exact juxtaposition CHAOS-3497 removed from
    // ops). `source_unavailable` mirrors `temporarily_unavailable`: the
    // scope resolved fine and a downstream source failed, so `exact` is
    // honest here.
    it("scope_forbidden_error emits scope.resolved (forbidden_or_not_found) immediately before the error frame", () => {
        const events = eventsFor("scope_forbidden_error");
        const kinds = events.map((event) => event.event);
        const scopeIndex = kinds.indexOf("scope.resolved");

        expect(scopeIndex).toBeGreaterThanOrEqual(0);
        expect(kinds[scopeIndex + 1]).toBe("error");
        expect(kinds.slice(-2)).toEqual(["error", "done"]);
        expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));

        const resolution = events[scopeIndex]!.scope_resolution as JsonRecord;
        expect(resolution.outcome).toBe("forbidden_or_not_found");
        expect(resolution.resolved_scope).toBeNull();
    });

    it("source_unavailable_error emits scope.resolved (exact) immediately before the error frame", () => {
        const events = eventsFor("source_unavailable_error");
        const kinds = events.map((event) => event.event);
        const scopeIndex = kinds.indexOf("scope.resolved");

        expect(scopeIndex).toBeGreaterThanOrEqual(0);
        expect(kinds[scopeIndex + 1]).toBe("error");
        expect(kinds.slice(-2)).toEqual(["error", "done"]);
        expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));

        const resolution = events[scopeIndex]!.scope_resolution as JsonRecord;
        expect(resolution.outcome).toBe("exact");
        expect(resolution.resolved_scope).not.toBeNull();
    });
});
