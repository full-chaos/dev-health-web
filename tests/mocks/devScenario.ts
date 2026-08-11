// Deterministic Ask Dev mock backend for the default Playwright suite
// (CHAOS-3287). Every payload here is derived from the checked-in,
// schema-validated canonical examples under
// src/lib/dev/contracts/examples/positive/ — never hand-invented shapes —
// so a drift between this mock and the real dev_answer.v1 contract fails
// loudly (the browser's own client.ts schema/semantic validation rejects an
// invalid mock response the same way it would reject a bad server response).
//
// Scenario selection is per-request, not shared global mutable state: the
// Playwright spec encodes which canned answer to return as a
// "[[ask-dev:<scenario>]] " prefix on the question text it types into the
// composer, and this module strips it before building the transcript/answer
// text. That keeps concurrently-running spec files from racing over a
// single shared "current scenario" variable — the exact hazard the
// pre-existing pagerduty/entitlement scenario globals accept by forcing a
// dedicated `workers: 1` Playwright project (see playwright.config.ts). The
// one exception is capabilities (`getCapabilities()` takes no per-request
// input at all), which does use a small shared mutable flag; CI already runs
// every project with `workers: 1` at the top level, so that shared state is
// safe for the gate even though a fully parallel local run could race it.
import { randomUUID } from "node:crypto";

import answerFixture from "../../src/lib/dev/contracts/examples/positive/dev_answer.v1.json";
import capabilitiesFixture from "../../src/lib/dev/contracts/examples/positive/dev_capabilities.v1.json";
import graphAssistanceFixture from "../../src/lib/dev/contracts/examples/positive/dev_answer_graph_assistance.v1.json";
import { ASK_DEV_OUTCOME_TABLE, outcomeCase } from "../fixtures/askDevOutcomes";

type JsonRecord = Record<string, unknown>;

function clone<T>(value: T): T {
    return structuredClone(value);
}

const OUTCOME_TABLE_KEYS = ASK_DEV_OUTCOME_TABLE.map((entry) => entry.key);

/**
 * The five `dev_answer.v2` no-answer outcomes as they reach a v1 client.
 *
 * `PublicOutcome` values in `NO_ANSWER_OUTCOMES` never become a `DevAnswer`:
 * the projector turns each into a `DevError` whose code and `retryable` flag
 * come from `_ERROR_OUTCOME_CODES` and whose text comes from the server-owned
 * `CANONICAL_NO_ANSWER_COPY` / `CANONICAL_NO_ANSWER_REMEDIATION` tables
 * (ops contracts_v2/compat.py:209-214, :484-494; validators.py). Producer
 * text is replaced wholesale, never trimmed or re-emitted, so these sentences
 * are the entire user-visible artifact of four of the eight outcomes.
 *
 * What the specs built on this table DO prove: the UI renders the server's
 * `safe_message` verbatim (none of these sentences exists anywhere in web
 * `src/`, so a client-side substitution fails the assertion), each outcome
 * renders its own distinct copy rather than one reused apology, and the
 * retry affordance follows `retryable`.
 *
 * What they DO NOT prove: that this table still matches ops. These strings
 * are a HAND-PINNED MIRROR — the canonical tables are Python constants in
 * `validators.py` and are not exported into any artifact web pins, so
 * nothing here detects ops-side drift. Compared to the ops source by script
 * on 2026-08-06 — all five entries match on both copy and remediation, and
 * the mirrored key set equals the ops key set — but that check has no
 * automated successor. Closing the gap needs the copy published as a pinned
 * contract vocabulary artifact (as `internal_prose_denylist.v1.json` already
 * is); tracked in CHAOS-3471.
 */
export const NO_ANSWER_OUTCOMES = [
    {
        outcome: "not_found",
        scenario: "no_answer_not_found",
        code: "scope_not_found",
        retryable: false,
        safeMessage: "No matching subject was found for this question.",
        remediation: ["Check the name and try again."],
        // See `SCOPE_RESOLUTION_OUTCOME_BY_NO_ANSWER` below for what this
        // field means and where it comes from.
        scopeResolutionOutcome: "unresolved",
    },
    {
        outcome: "temporarily_unavailable",
        scenario: "no_answer_temporarily_unavailable",
        code: "source_unavailable",
        retryable: true,
        safeMessage: "This answer is temporarily unavailable. Please try again shortly.",
        remediation: ["Try the question again in a few minutes."],
        scopeResolutionOutcome: "exact",
    },
    {
        outcome: "unsupported",
        scenario: "no_answer_unsupported",
        code: "feature_not_enabled",
        retryable: false,
        safeMessage: "This question is not supported yet.",
        remediation: ["Try a status, health, or metric question instead."],
        scopeResolutionOutcome: null,
    },
    {
        outcome: "denied",
        scenario: "no_answer_denied",
        code: "forbidden",
        retryable: false,
        safeMessage: "You do not have access to ask about this.",
        remediation: ["Ask an administrator for access to this area."],
        scopeResolutionOutcome: null,
    },
    {
        outcome: "failed",
        scenario: "no_answer_failed",
        code: "internal_error",
        retryable: false,
        safeMessage: "Something went wrong while preparing this answer.",
        remediation: ["Try the question again."],
        scopeResolutionOutcome: "exact",
    },
] as const;

/**
 * What `scope.resolved` outcome (if any) each `NO_ANSWER_OUTCOMES` entry's
 * stream carries, immediately before its `error` frame (CHAOS-3526).
 *
 * As of CHAOS-3497, ops emits `scope.resolved` on every terminal whose run
 * completed scope resolution -- including a no-answer error terminal --
 * built from `OrchestratorResult.scope_resolution`
 * (`streaming.stream_orchestrator`). Which outcome each of these five
 * carries is pinned against the real producer, not invented: the ops
 * acceptance corpus's own `resolution-profiles/deterministic-v1.json` maps
 * every corpus case's `expected_public_outcome` to an
 * `expected_scope_resolution_outcome`, and every case sharing one of these
 * five public outcomes agrees on a single value --
 *   not_found               -> unresolved
 *   temporarily_unavailable -> exact
 *   unsupported             -> null
 *   denied                  -> null
 *   failed                  -> exact
 * `null` means no `scope.resolved` event at all, not a placeholder
 * resolution: `unsupported` (an oversized/unsupported request rejected by
 * `subject_preflight`'s bound) and `denied` (a provider-level refusal) are
 * both rejected before any catalog round trip ever runs, so
 * `OrchestratorResult.scope_resolution` is `None` and streaming's own
 * negative control applies ("a run that never resolved scope emits no
 * scope frame") -- inventing a resolution here would assert something the
 * run never reached, the same overclaiming CHAOS-3497 exists to prevent in
 * the other direction.
 */

type NoAnswerScenario = (typeof NO_ANSWER_OUTCOMES)[number]["scenario"];

const NO_ANSWER_BY_SCENARIO = new Map<string, (typeof NO_ANSWER_OUTCOMES)[number]>(
    NO_ANSWER_OUTCOMES.map((entry) => [entry.scenario, entry]),
);

export type DevAnswerScenario =
    | (typeof ASK_DEV_OUTCOME_TABLE)[number]["key"]
    | "needs_clarification"
    | "degraded_sources_only"
    | "leaky_prose"
    | "full_sections"
    | "graph_assisted"
    | "refused_with_grounding"
    | "scope_unresolved"
    | "scope_organization_fallback"
    | "scope_filtered"
    | "scope_inherited"
    | "forbidden_or_not_found_scope"
    | "scope_forbidden_error"
    | "source_unavailable_error"
    | NoAnswerScenario;

const SCENARIO_MARKER = /^\[\[ask-dev:([a-z_]+)\]\]\s*/u;
const KNOWN_SCENARIOS: ReadonlySet<string> = new Set<DevAnswerScenario>([
    ...OUTCOME_TABLE_KEYS,
    "needs_clarification",
    "degraded_sources_only",
    "leaky_prose",
    "full_sections",
    "graph_assisted",
    "refused_with_grounding",
    "scope_unresolved",
    "scope_organization_fallback",
    "scope_filtered",
    "scope_inherited",
    "forbidden_or_not_found_scope",
    "scope_forbidden_error",
    "source_unavailable_error",
    ...NO_ANSWER_OUTCOMES.map((entry) => entry.scenario),
]);

export function parseScenario(question: string): {
    scenario: DevAnswerScenario;
    visibleQuestion: string;
} {
    const match = SCENARIO_MARKER.exec(question);
    const scenario =
        match && KNOWN_SCENARIOS.has(match[1]!) ? (match[1] as DevAnswerScenario) : "complete";
    return { scenario, visibleQuestion: match ? question.slice(match[0].length) : question };
}

/**
 * Server-owned clarification copy, mirroring ops
 * `preflight_outcomes.CLARIFICATION_COPY`.
 *
 * `needs_clarification` is the one outcome whose `frame.direct_answer` is NOT
 * producer-authored: the preflight supplies these exact sentences, and the
 * v2->v1 projector passes them through unchanged. An earlier draft of the
 * clarification scenario invented its own wording, which meant the browser
 * test asserted a sentence production never sends (codex adversarial review,
 * HIGH) — the same defect class row W2 was created to fix.
 *
 * Hand-pinned, with the same limitation as `NO_ANSWER_OUTCOMES`: these are
 * Python constants exported into no artifact web pins, so this mirror cannot
 * detect ops-side drift. Compared to the ops source by script on 2026-08-06
 * (both keys byte-identical); tracked in CHAOS-3471 with the no-answer
 * tables.
 */
export const CLARIFICATION_COPY = {
    // Mirrors the FULL ops key set, not only the keys these scenarios use.
    // A partial mirror beside a "matches ops" comment overstates parity and
    // leaves a canonical branch unmirrored (codex adversarial review round 2,
    // MEDIUM). `not_found_close_matches` belongs to the CHAOS-3366 no-match
    // path and is not exercised by any scenario here; it is mirrored so the
    // key sets are equal and drift in it is visible to a reader.
    not_found_close_matches:
        "I could not find an authorized entity of that kind with that name. " +
        "Here are the closest matches -- please ask again naming one of them.",
    ambiguous:
        "More than one authorized entity matches the name in this question. " +
        "Please ask again naming exactly which one you mean.",
    uninterpretable:
        "This question could not be interpreted confidently. Please rephrase " +
        "it, naming the project, repository, or team you are asking about.",
} as const;

/**
 * The candidate entity refs the `needs_clarification` scenario offers.
 *
 * Exported so a spec asserting what "Use this scope" committed reads the
 * same labels the mock served instead of restating them — a restated label
 * lets the mock drift while the assertion still passes.
 */
export const CLARIFICATION_CANDIDATE_REFS = [
    {
        entity_id: "repo_dev_health",
        entity_type: "repository",
        display_label: "dev-health (this repository)",
        repository_id: null,
    },
    {
        entity_id: "repo_dev_health_web",
        entity_type: "repository",
        display_label: "dev-health-web",
        repository_id: null,
    },
] as const;

/**
 * Rewrites a repository-shaped scope from the canonical fixture into the
 * organization-shaped scope ops builds when there is no committed subject
 * (`_build_resolved_scope` returns a DirectScope.ORGANIZATION DevScope for a
 * frame with `subject_ref is None`).
 *
 * The surface_context refs must be cleared too: `validateScope` requires a
 * repository direct_scope while repository refs are attached, so a scope that
 * changed only `direct_scope` is rejected outright as an invalid stream
 * event (codex adversarial review round 2, HIGH).
 */
function toOrganizationScope(scope: JsonRecord): JsonRecord {
    const organizationScope = clone(scope);
    organizationScope.direct_scope = "organization";
    organizationScope.repositories = [];
    organizationScope.entity_refs = [];
    // `team_ids` is empty too: the no-subject branch builds the DevScope from
    // scratch with empty repositories, entity_refs AND team_ids — it does not
    // carry the requested scope's team filter forward.
    organizationScope.team_ids = [];
    // `_build_resolved_scope` constructs the no-subject scope from scratch
    // with only schema_version, organization_id, direct_scope, repositories,
    // entity_refs, team_ids and time_range. `comparison_range` and
    // `surface_context` are never passed, so they take their None defaults —
    // carrying the repository fixture's values forward produced a payload
    // that is schema-valid but that production cannot emit (codex
    // adversarial review round 4).
    organizationScope.comparison_range = null;
    organizationScope.surface_context = null;
    return organizationScope;
}

/**
 * Recomputes a resolution's authorization lists FROM its committed scope, the
 * way the projector does (`authorized_repository_ids=list(resolved.repositories)`,
 * `authorized_entity_ids=[ref.entity_id for ref in resolved.entity_refs]`,
 * compat.py:325-326).
 *
 * Derived rather than hardcoded so it cannot drift from the scope beside it.
 * Leaving the repository-scoped lists in place while widening the scope
 * produced a resolution that claimed organization-wide reach while still
 * naming one authorized repository — a contradiction a widening test must be
 * able to tell apart from the real thing (codex adversarial review round 3).
 */
function syncAuthorizedIds(resolution: JsonRecord, committedScope: JsonRecord): void {
    resolution.authorized_repository_ids = clone(committedScope.repositories ?? []);
    resolution.authorized_entity_ids = ((committedScope.entity_refs ?? []) as JsonRecord[]).map(
        (ref) => ref.entity_id,
    );
}

let answerCounter = 0;
let evidenceCounter = 0;

function nextAnswerId(): string {
    answerCounter += 1;
    return `answer_e2e_${answerCounter}`;
}

/** Builds one schema-valid dev_answer.v1 for the requested scenario. */
function buildAnswer(
    scenario: DevAnswerScenario,
    conversationId: string,
    visibleQuestion: string,
): JsonRecord {
    const base = clone(answerFixture) as JsonRecord;
    base.answer_id = nextAnswerId();
    base.conversation_id = conversationId;
    const nowIso = new Date().toISOString();
    base.as_of = nowIso;
    base.generated_at = nowIso;

    if ((OUTCOME_TABLE_KEYS as readonly string[]).includes(scenario)) {
        const outcome = outcomeCase(scenario);
        // "complete" deliberately does NOT overwrite status/direct_summary
        // from the table: the canonical fixture (dev_answer.v1.json) IS the
        // real producer for that scenario, and letting its own fields flow
        // through unmodified is what makes a real contract-fixture mutation
        // (e.g. status changed to something else, or direct_summary edited)
        // break this scenario's e2e test — proving the fixture is actually
        // exercised, not just present. The other statuses below have no
        // canonical positive example to draw from (only one exists, and its
        // status is "complete"), so they necessarily construct synthetic
        // content; ASK_DEV_OUTCOME_TABLE's `status` values are still
        // constrained to the pinned schema's real AnswerStatus enum (see
        // askDevContracts.ts), and tests/ask-dev-vocabulary.spec.ts asserts
        // that constraint plus full enum coverage.
        if (scenario !== "complete") {
            base.status = outcome.status;
            base.direct_summary = outcome.directSummary;
        }
        if (outcome.emptyEvidence) {
            base.claims = [];
            base.evidence = [];
            base.metrics = [];
            base.suggested_follow_up_questions = [];
        }
        // Scenario-specific coverage/warning detail beyond what the shared
        // table encodes (the table only owns status + summary + caption,
        // per its own header comment).
        if (scenario === "partial") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 9,
                required_source_count: 12,
                unavailable_required_sources: ["deployments"],
            };
            base.warnings = ["Deployment evidence was unavailable for part of the window."];
        } else if (scenario === "degraded") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                stale_required_sources: ["work_graph"],
            };
            base.warnings = ["Work graph data is stale for part of the requested window."];
        } else if (scenario === "insufficient_evidence") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 0,
                required_source_count: 1,
                unavailable_required_sources: ["work_graph"],
            };
        }
        return base;
    }

    switch (scenario) {
        case "needs_clarification": {
            // CHAOS-3219 W2. This scenario previously left the canonical
            // fixture's `status: "complete"` in place while rewriting the
            // scope row -- a payload production cannot emit, so the e2e
            // assertions on it were proving nothing about the real product.
            //
            // The authoritative shape comes from the v2->v1 projector
            // (ops contracts_v2/compat.py `_project_needs_clarification`).
            // What the projector GUARANTEES: `status` is
            // `insufficient_evidence`, `claims`/`metrics`/`evidence`/
            // `conflicts` are all hard-coded empty, and the scope row
            // carries `ambiguous` when the frame has clarification
            // candidates (`unresolved` when it does not — see the
            // `scope_unresolved` scenario). `answered`/`answered_with_gaps`
            // are the only outcomes that may carry content.
            //
            // What is this scenario's own CHOICE, not a projector guarantee:
            // the zeroed coverage and the empty warnings/follow-ups. Those
            // three pass through from the frame (`coverage=_as_v1(...)`,
            // `warnings=list(frame.limitations)`,
            // `suggested_follow_up_questions=list(frame.safe_follow_up_
            // questions)`), so a clarification answer MAY legitimately carry
            // them. Zeroed coverage is chosen here because no source plan
            // runs for a subject that was never committed; it is one valid
            // instance of the shape, not the only one.
            base.status = "insufficient_evidence";
            base.direct_summary = CLARIFICATION_COPY.ambiguous;
            base.claims = [];
            base.evidence = [];
            base.metrics = [];
            base.warnings = [];
            base.suggested_follow_up_questions = [];
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 0,
                required_source_count: 0,
                unavailable_required_sources: [],
                stale_required_sources: [],
            };
            const resolvedScope = base.resolved_scope as JsonRecord;
            resolvedScope.outcome = "ambiguous";
            resolvedScope.resolved_scope = null;
            resolvedScope.authorized_repository_ids = [];
            resolvedScope.authorized_entity_ids = [];
            resolvedScope.candidates = [
                {
                    entity_ref: clone(CLARIFICATION_CANDIDATE_REFS[0]) as JsonRecord,
                    reason: `Matches "${visibleQuestion.trim().slice(0, 40)}" by name`,
                },
                {
                    entity_ref: clone(CLARIFICATION_CANDIDATE_REFS[1]) as JsonRecord,
                    reason: "Also matches by name",
                },
            ];
            return base;
        }
        case "full_sections": {
            // CHAOS-3219 W13. The canonical fixture carries no conflicts and
            // no warnings, so no default-tier test had ever rendered an
            // answer with every section present — and the one ordering test
            // that exists compares just two of them. TRD §16 fixes the
            // reading order (scope -> coverage -> findings -> conflicts ->
            // metrics -> evidence -> limitations -> follow-ups) and that is
            // the evidence-first hierarchy CHAOS-3291 was about.
            const evidence = base.evidence as JsonRecord[];
            const secondEvidence = clone(evidence[0]!) as JsonRecord;
            secondEvidence.evidence_ref_id = "ev_02";
            secondEvidence.display_label = "Pull request 452";
            secondEvidence.entity_id = "452";
            base.evidence = [evidence[0]!, secondEvidence];
            base.conflicts = [
                {
                    summary: "Two sources disagree about the merge date.",
                    evidence_ref_ids: ["ev_01", "ev_02"],
                },
            ];
            base.warnings = ["Deployment evidence covers only part of the window."];
            return base;
        }
        case "graph_assisted": {
            // Keep the browser scenario assembled from the same generated
            // graph-assistance contract example used by the renderer tests.
            // The answer fixture supplies the surrounding dev_answer.v1
            // envelope and evidence refs. Production routing promotes a
            // truncated-traversal limitation to the truncated state, so keep
            // that semantic precedence even though the shape fixture carries
            // the independently valid `enabled` enum example.
            //
            // The generated positive example predates CHAOS-3669's public
            // cohort projection. Add the fields that the production
            // `_public_cohort_slot` emits from the canonical ranking result,
            // retaining production-reachable observation, metric, and gap
            // signal shapes pinned by the ops ranker. This is deliberately a single authorized
            // member: the public contract never names filtered candidates.
            const graphAssisted = clone(graphAssistanceFixture);
            const cohortMember = graphAssisted.cohort?.members[0];
            if (!cohortMember) {
                throw new Error("graph assistance fixture must include a cohort member");
            }
            base.graph_assisted = {
                ...graphAssisted,
                evidence_lineage: [],
                ranked_drivers: [],
                state: "truncated",
                cohort: {
                    ...graphAssisted.cohort,
                    members: [
                        {
                            ...cohortMember,
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
                    ],
                },
            };
            return base;
        }
        case "refused_with_grounding": {
            // CHAOS-3219 W12. CHAOS-3377's client-side backstop: a row
            // labelled `refused` that nonetheless carries material grounding
            // is a self-contradiction, so the narrative is WITHHELD and the
            // pill reads "Inconsistent result" — never relabelled "Answered"
            // over the rejected prose. Structured metrics and evidence are
            // unaffected and must still render. Regression-covered at the
            // unit tier only until now.
            base.status = "refused";
            base.direct_summary = "Delivery improved by twelve items this period.";
            return base;
        }
        case "scope_unresolved":
        case "scope_organization_fallback":
        case "scope_filtered":
        case "scope_inherited": {
            // CHAOS-3219 W14. Four of the seven pinned ScopeResolutionOutcome
            // values had no rendered-surface assertion at all — they were
            // enumerated as "documented excluded" in the vocabulary spec,
            // which records the gap rather than closing it. Two of them
            // (`organization_fallback`, `unresolved`) are also
            // NEVER_ATTESTABLE_TOKENS and sit directly on the "zero silent
            // organization widening" launch threshold.
            //
            // Each outcome is built to the shape the contract actually
            // requires rather than by stamping the enum onto the happy-path
            // fixture: `unresolved` sits on the no-resolved-scope side of the
            // partition, and `organization_fallback` must carry an
            // organization-scoped commit (client `validateScopeResolution`
            // mirrors ops `DevScopeResolution.validate_outcome`). Building
            // them any other way produces a payload the browser client
            // rejects outright — which is how the first draft of this
            // scenario was caught.
            const outcome = scenario.slice("scope_".length);
            const resolvedScope = base.resolved_scope as JsonRecord;
            resolvedScope.outcome = outcome;
            resolvedScope.candidates = [];
            if (outcome === "unresolved") {
                // `unresolved` is NOT reachable beside a completed answer.
                // The only producer is `_project_needs_clarification` taking
                // its no-candidates branch (compat.py:427) — the question
                // could not be interpreted, so nothing ran. That path emits
                // `insufficient_evidence` with empty content and the
                // server-owned "uninterpretable" clarification sentence. An
                // earlier draft stamped the enum onto the happy-path fixture
                // and so asserted an answer shape ops cannot produce; that
                // is the same defect row W2 exists to fix (codex adversarial
                // review, HIGH).
                base.status = "insufficient_evidence";
                base.direct_summary = CLARIFICATION_COPY.uninterpretable;
                base.claims = [];
                base.metrics = [];
                base.evidence = [];
                base.conflicts = [];
                base.warnings = [];
                base.suggested_follow_up_questions = [];
                (base.coverage as JsonRecord) = {
                    ...(base.coverage as JsonRecord),
                    available_source_count: 0,
                    required_source_count: 0,
                    unavailable_required_sources: [],
                    stale_required_sources: [],
                };
                // `requested_scope` must be organization-shaped too. The
                // projector sets BOTH requested and resolved from the same
                // `_build_resolved_scope(...)` result (compat.py:404, :431),
                // and with no subject that result is an organization scope.
                // Leaving the happy-path repository requested_scope produced
                // a contradictory pairing — an unresolved subject beside a
                // committed repository request — which is precisely the
                // silent-widening shape these rows exist to detect (codex
                // adversarial review round 2, HIGH).
                resolvedScope.requested_scope = toOrganizationScope(
                    resolvedScope.requested_scope as JsonRecord,
                );
                resolvedScope.resolved_scope = null;
                resolvedScope.authorized_repository_ids = [];
                resolvedScope.authorized_entity_ids = [];
            } else if (outcome === "organization_fallback") {
                // An organization commit is more than a changed enum: the
                // scope's own surface_context must agree with it. With a
                // repository entity ref still attached, `validateScope`
                // requires direct_scope "repository", so the payload is
                // rejected as an invalid stream event. Clearing the refs
                // moves it onto the organization-route branch, which
                // `diagnose_overview` (the fixture's route) satisfies.
                const organizationScope = toOrganizationScope(
                    resolvedScope.resolved_scope as JsonRecord,
                );
                resolvedScope.resolved_scope = organizationScope;
                resolvedScope.requested_scope = clone(organizationScope);
                syncAuthorizedIds(resolvedScope, organizationScope);
                // The ANSWER CONTENT has to widen with the scope. Leaving
                // repository-scoped claim validity beside an organization
                // commit is the contradictory pairing a widening test must
                // be able to tell apart from the real thing (codex round 2,
                // HIGH).
                for (const claim of base.claims as JsonRecord[]) {
                    claim.validity_scope = clone(organizationScope);
                }
            }
            return base;
        }
        case "leaky_prose": {
            // CHAOS-3219 W5. `safeCopy` guards five separate prose fields,
            // but the default suite only ever checked the failed-run alert
            // and the status/scope pills, so no test drove a poisoned
            // payload through direct_summary, claim text, conflict summary,
            // warnings or follow-ups.
            //
            // Each poisoned field carries a DIFFERENT denylisted token, so a
            // guard applied to only one field cannot satisfy the whole
            // scenario. None of the tokens is in NEVER_ATTESTABLE_TOKENS --
            // those would additionally flip the answer into the no-match
            // presentation and change what is being measured.
            //
            // The clean fields carry the guard's three documented false-
            // positive shapes and must survive verbatim: word-boundary
            // matching is what separates `factual_completion` from
            // `actual_completion` and `cannot_ready` from `not_ready`, and
            // shape matching is what separates `prev1_state` from a real
            // `ev1_<40 hex>` handle. Without these, a guard that widened to
            // bare substring matching would still pass every assertion above.
            const evidence = base.evidence as JsonRecord[];
            const secondEvidence = clone(evidence[0]!) as JsonRecord;
            secondEvidence.evidence_ref_id = "ev_02";
            secondEvidence.display_label = "Pull request 452";
            secondEvidence.entity_id = "452";
            base.evidence = [evidence[0]!, secondEvidence];

            const claims = base.claims as JsonRecord[];
            const poisonedClaim = clone(claims[0]!) as JsonRecord;
            poisonedClaim.claim_id = "claim_poisoned";
            poisonedClaim.text = "Delivery slowed because internal_error was reported upstream.";
            const cleanClaim = clone(claims[0]!) as JsonRecord;
            cleanClaim.claim_id = "claim_clean";
            cleanClaim.text = "Completion is computed by the prev1_state accessor.";
            base.claims = [poisonedClaim, cleanClaim];

            base.direct_summary =
                "The scope resolved to insufficient_evidence before the metrics were read.";
            base.conflicts = [
                {
                    summary: "Two sources disagree because feature_not_enabled was returned.",
                    evidence_ref_ids: ["ev_01", "ev_02"],
                },
            ];
            base.warnings = [
                "Provider health degraded after source_unavailable was raised.",
                "Coverage was computed from factual_completion.ts inputs.",
            ];
            base.suggested_follow_up_questions = [
                "Should the not_ready pipeline be retried?",
                "Should the cannot_ready helper be reviewed?",
            ];
            return base;
        }
        case "degraded_sources_only": {
            // CHAOS-3219 W4. `degraded_required_sources` is the third
            // required-source failure state in DevCoverage, and it blocks a
            // `complete` answer on its own. No scenario carried it, so the
            // suite never rendered an answer whose ONLY coverage problem was
            // degradation — the shape that used to display no coverage block
            // at all.
            base.status = "degraded";
            base.direct_summary =
                "Delivery flow improved, but one required source answered in a degraded state.";
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 11,
                required_source_count: 12,
                degraded_required_sources: ["work_graph"],
                stale_required_sources: [],
                unavailable_required_sources: [],
            };
            base.warnings = ["Work graph answered in a degraded state for part of the window."];
            return base;
        }
        case "forbidden_or_not_found_scope": {
            // A real, reachable ScopeResolutionOutcome (contracts.py
            // `ScopeResolutionOutcome.FORBIDDEN_OR_NOT_FOUND`) — the exact
            // internal value AskDevAnswer.tsx:333 currently renders raw
            // (`scopeResolution.outcome.replaceAll("_", " ")`). Public
            // copy must never disclose which of "forbidden" or "not found"
            // applies (that would itself leak hidden-entity existence).
            // CHAOS-3367: mirrors what ops
            // (no_match_terminal.named_subject_not_found_answer) actually
            // emits now, not an approximation of it -- the PRD's verbatim
            // sentence, insufficient_evidence rather than refused, no
            // warnings, and a zero coverage block because no source plan ran
            // for a subject that was never resolved. A mock that kept the old
            // shape would let the e2e suite assert a payload production no
            // longer produces.
            base.status = "insufficient_evidence";
            base.direct_summary =
                "I couldn't find an authorized project named 'Zed' in the selected " +
                "organization. I did not substitute organization-wide data. Here are " +
                "the closest matches, if any.";
            base.claims = [];
            base.evidence = [];
            base.metrics = [];
            base.warnings = [];
            base.suggested_follow_up_questions = [];
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 0,
                required_source_count: 0,
                unavailable_required_sources: [],
                stale_required_sources: [],
            };
            const resolvedScope = base.resolved_scope as JsonRecord;
            resolvedScope.outcome = "forbidden_or_not_found";
            resolvedScope.resolved_scope = null;
            resolvedScope.authorized_repository_ids = [];
            resolvedScope.authorized_entity_ids = [];
            resolvedScope.candidates = [];
            return base;
        }
        default:
            return base;
    }
}

let runCounter = 0;

function nextRunId(): string {
    runCounter += 1;
    return `run_e2e_${runCounter}`;
}

/**
 * A schema-valid `dev_scope_resolution.v1` for an error terminal's
 * `scope.resolved` frame (CHAOS-3526), derived from the checked-in
 * canonical `exact` fixture rather than hand-authored.
 *
 * `"exact"` returns the fixture's own resolution unchanged -- it is already
 * a real, schema-valid `exact` commit. The two unhealthy outcomes clear
 * `resolved_scope`/the authorization lists/`candidates` the same way the
 * `forbidden_or_not_found_scope` and `scope_unresolved` answer scenarios
 * above do, so this cannot describe a shape those scenarios' own pinned
 * tests would reject: `unresolved` and `forbidden_or_not_found` both sit on
 * DevScopeResolution's un-resolved side (`resolved_scope` is `None`), and
 * neither carries the fixture's repository-scoped authorization.
 * `forbidden_or_not_found` MAY carry `candidates` (CHAOS-3367) but is never
 * required to; none are offered here since the mock has no closest-match
 * catalog to draw them from.
 */
function buildScopeResolution(
    outcome: "exact" | "unresolved" | "forbidden_or_not_found",
): JsonRecord {
    const resolution = clone((answerFixture as JsonRecord).resolved_scope) as JsonRecord;
    if (outcome === "exact") return resolution;
    resolution.outcome = outcome;
    resolution.resolved_scope = null;
    resolution.authorized_repository_ids = [];
    resolution.authorized_entity_ids = [];
    resolution.candidates = [];
    return resolution;
}

/** Builds one schema-valid, semantically-valid dev_stream_event.v1[] run. */
export function buildStreamEvents(
    scenario: DevAnswerScenario,
    conversationId: string,
    visibleQuestion: string,
): JsonRecord[] {
    const runId = nextRunId();
    const occurredAt = new Date().toISOString();
    let sequence = 0;
    const events: JsonRecord[] = [];
    const push = (event: JsonRecord) => {
        events.push({
            answer: null,
            delta: null,
            error: null,
            progress: null,
            scope_resolution: null,
            terminal_kind: null,
            warning: null,
            schema_version: "dev_stream_event.v1",
            run_id: runId,
            occurred_at: occurredAt,
            sequence: sequence++,
            ...event,
        });
    };

    push({ event: "run.started" });
    push({ event: "progress", progress: "resolving_scope" });
    push({ event: "progress", progress: "checking_evidence" });

    const noAnswer = NO_ANSWER_BY_SCENARIO.get(scenario);
    if (noAnswer) {
        // CHAOS-3526: `scope.resolved` immediately before the terminal, and
        // only when this run's outcome family actually reached scope
        // resolution -- see the block comment above `NO_ANSWER_OUTCOMES`
        // for the per-outcome sourcing.
        if (noAnswer.scopeResolutionOutcome !== null) {
            push({
                event: "scope.resolved",
                scope_resolution: buildScopeResolution(noAnswer.scopeResolutionOutcome),
            });
        }
        push({
            event: "error",
            error: {
                code: noAnswer.code,
                remediation: [...noAnswer.remediation],
                request_id: randomUUID(),
                retryable: noAnswer.retryable,
                safe_message: noAnswer.safeMessage,
                schema_version: "dev_error.v1",
            },
        });
        push({ event: "done", terminal_kind: "error" });
        return events;
    }

    if (scenario === "scope_forbidden_error" || scenario === "source_unavailable_error") {
        // CHAOS-3526: both scenarios reach an error only after scope
        // resolution completed, so both carry `scope.resolved` immediately
        // before it. `scope_forbidden_error` mirrors ops
        // `orchestrator.run()`'s top-level resolve-outcome branch (a
        // resolution outcome outside `{ambiguous, unresolved,
        // forbidden_or_not_found}` still forbidden by an authorization
        // check downstream of scope resolution) with the "genuinely
        // unhealthy" `forbidden_or_not_found` outcome CHAOS-3497 uses for
        // this family elsewhere -- never a healthy `exact` beside a "you
        // don't have access" error, which is the exact juxtaposition
        // CHAOS-3497 removed from ops. `source_unavailable_error` mirrors
        // the `temporarily_unavailable` no-answer outcome: the scope
        // resolved fine and a downstream source failed, so `exact` is
        // honest here.
        const scopeResolutionOutcome =
            scenario === "scope_forbidden_error" ? "forbidden_or_not_found" : "exact";
        push({
            event: "scope.resolved",
            scope_resolution: buildScopeResolution(scopeResolutionOutcome),
        });
        const error =
            scenario === "scope_forbidden_error"
                ? {
                      code: "scope_forbidden",
                      request_id: randomUUID(),
                      retryable: false,
                      safe_message: "You don't have access to that scope.",
                      schema_version: "dev_error.v1",
                  }
                : {
                      code: "source_unavailable",
                      remediation: ["Retry after source health recovers."],
                      request_id: randomUUID(),
                      retryable: true,
                      safe_message: "A required source is temporarily unavailable.",
                      schema_version: "dev_error.v1",
                  };
        push({ event: "error", error });
        push({ event: "done", terminal_kind: "error" });
        return events;
    }

    push({ event: "answer.delta", delta: "Checking the evidence in this scope… " });
    const answer = buildAnswer(scenario, conversationId, visibleQuestion);
    push({ event: "answer.completed", answer });
    push({ event: "done", terminal_kind: "answer" });
    return events;
}

export function encodeSseFrames(events: readonly JsonRecord[]): string {
    return events
        .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
        .join("");
}

// --- Capabilities (shared mutable state; see module comment) ---------------

// `not_ready` is retained as an alias for `missing_credentials` so the
// pre-existing specs and helper calls keep working; the other members are the
// real dev_capabilities.v1 `readiness` enum, four of whose five values had no
// default-CI coverage (CHAOS-3219 W14).
export const NOT_READY_READINESS_VALUES = [
    "missing_credentials",
    "unsupported_model",
    "degraded",
] as const;

export type DevCapabilitiesState =
    "ready" | "not_ready" | "disabled" | (typeof NOT_READY_READINESS_VALUES)[number];

const CAPABILITIES_STATES: ReadonlySet<string> = new Set<DevCapabilitiesState>([
    "ready",
    "not_ready",
    "disabled",
    ...NOT_READY_READINESS_VALUES,
]);

let capabilitiesState: DevCapabilitiesState = "ready";

export function setDevCapabilitiesState(state: string): boolean {
    if (!CAPABILITIES_STATES.has(state)) return false;
    capabilitiesState = state as DevCapabilitiesState;
    return true;
}

export function getDevCapabilitiesResponse(): JsonRecord {
    const base = clone(capabilitiesFixture) as JsonRecord;
    if (capabilitiesState === "disabled") {
        return { ...base, ask_dev: false, can_read: false, readiness: "disabled" };
    }
    if (capabilitiesState !== "ready") {
        return {
            ...base,
            ask_dev: true,
            can_read: true,
            readiness:
                capabilitiesState === "not_ready" ? "missing_credentials" : capabilitiesState,
            administrator_safe_failure_reason:
                "Ask Dev is enabled, but an administrator needs to finish provider setup.",
        };
    }
    return { ...base, ask_dev: true, can_read: true, can_manage: true, readiness: "ready" };
}

// --- Conversation store ------------------------------------------------

type StoredConversation = {
    conversation: JsonRecord;
    items: JsonRecord[];
    seenClientMessageIds: Map<string, JsonRecord>;
};

const conversations = new Map<string, StoredConversation>();

// Request counters exposed at /__test/dev-requests so specs can assert "no
// provider call/page-data transmission occurs merely from opening a
// surface" and "one message/run is created under duplicate click" without
// guessing at network timing.
let messagesRequestCount = 0;
let conversationsCreatedCount = 0;
// The scope actually SUBMITTED with the most recent message. Displayed state
// is not proof that the next request carries the scope the user chose: a
// defect that renders the chosen candidate while still sending the old (or an
// organization-wide) scope would satisfy every display assertion (codex
// adversarial review, HIGH). Recorded here so a spec can assert on the wire.
let lastMessageScope: unknown = null;

export function recordMessagesRequest(): void {
    messagesRequestCount += 1;
}

export function recordConversationCreated(): void {
    conversationsCreatedCount += 1;
}

export function getDevRequestCounts(): {
    messages: number;
    conversationsCreated: number;
    lastMessageScope: unknown;
} {
    return {
        messages: messagesRequestCount,
        conversationsCreated: conversationsCreatedCount,
        lastMessageScope,
    };
}

export function resetDevMockState(): void {
    conversations.clear();
    messagesRequestCount = 0;
    conversationsCreatedCount = 0;
    lastMessageScope = null;
    capabilitiesState = "ready";
    answerCounter = 0;
    runCounter = 0;
    evidenceCounter = 0;
}

export function createConversation(currentScope: unknown, title: unknown): JsonRecord {
    const conversationId = `conversation_e2e_${randomUUID()}`;
    const nowIso = new Date().toISOString();
    const visibleTitle = typeof title === "string" ? parseScenario(title).visibleQuestion : null;
    const conversation: JsonRecord = {
        conversation_id: conversationId,
        created_at: nowIso,
        updated_at: nowIso,
        current_scope: currentScope,
        expires_at: null,
        latest_answer_id: null,
        message_count: 0,
        retention_days: 30,
        schema_version: "dev_conversation.v1",
        state: "active",
        title: visibleTitle,
    };
    conversations.set(conversationId, {
        conversation,
        items: [],
        seenClientMessageIds: new Map(),
    });
    recordConversationCreated();
    return clone(conversation);
}

export function getConversation(conversationId: string): JsonRecord | null {
    const stored = conversations.get(conversationId);
    return stored ? clone(stored.conversation) : null;
}

export function listConversations(): JsonRecord[] {
    return [...conversations.values()]
        .sort(
            (a, b) =>
                Date.parse(String(b.conversation.updated_at)) -
                Date.parse(String(a.conversation.updated_at)),
        )
        .map((stored) => ({
            conversation_id: stored.conversation.conversation_id,
            direct_scope: (stored.conversation.current_scope as JsonRecord).direct_scope,
            expires_at: stored.conversation.expires_at,
            message_count: stored.conversation.message_count,
            schema_version: "dev_conversation_summary.v1",
            state: stored.conversation.state,
            title: stored.conversation.title,
            updated_at: stored.conversation.updated_at,
        }));
}

export function renameConversation(
    conversationId: string,
    title: string | null,
): JsonRecord | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    stored.conversation.title = title;
    stored.conversation.updated_at = new Date().toISOString();
    return clone(stored.conversation);
}

export function deleteConversation(conversationId: string): boolean {
    return conversations.delete(conversationId);
}

export function getTranscript(conversationId: string): JsonRecord | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    return {
        conversation_id: conversationId,
        items: clone(stored.items),
        next_cursor: null,
        schema_version: "dev_conversation_transcript.v1",
    };
}

const RETRYABLE_ERROR_SCENARIOS: ReadonlySet<DevAnswerScenario> = new Set([
    "scope_forbidden_error",
    "source_unavailable_error",
]);

/**
 * Applies one message/run to a stored conversation and returns its SSE
 * frames. Replays the identical prior frames for a repeated
 * `client_message_id` on the same conversation instead of appending another
 * transcript entry — the deterministic proxy for "one message/run is
 * created under duplicate click, ... reconnect, retry" without a real
 * network layer to actually drop the duplicate request.
 */
export function applyMessage(
    conversationId: string,
    clientMessageId: string,
    rawQuestion: string,
    scope: unknown,
    retryOfRunId: string | null,
): { frames: string; replayed: boolean } | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    recordMessagesRequest();
    lastMessageScope = scope;

    const existing = stored.seenClientMessageIds.get(clientMessageId);
    if (existing) {
        return { frames: encodeSseFrames(existing.events as JsonRecord[]), replayed: true };
    }

    const parsed = parseScenario(rawQuestion);
    // A retry of a retryable stream-level failure succeeds on the next
    // attempt — this is what makes "click Retry" an observably different,
    // real second request rather than a no-op that merely leaves the
    // original failed alert on screen (a prior version of the retry spec
    // only asserted the pre-existing alert was "still visible", which
    // would have passed even with an inert Retry button).
    const scenario =
        retryOfRunId && RETRYABLE_ERROR_SCENARIOS.has(parsed.scenario)
            ? "complete"
            : parsed.scenario;
    const visibleQuestion = parsed.visibleQuestion;
    const events = buildStreamEvents(scenario, conversationId, visibleQuestion);
    stored.seenClientMessageIds.set(clientMessageId, { events });

    const nowIso = new Date().toISOString();
    const runId = String((events[0] as JsonRecord).run_id);
    const terminal = events.find(
        (event) => event.event === "answer.completed" || event.event === "error",
    ) as JsonRecord | undefined;
    const runState =
        terminal?.event === "answer.completed"
            ? "completed"
            : terminal?.event === "error"
              ? "failed"
              : "failed";

    stored.items.push({
        answer: null,
        created_at: nowIso,
        message_id: `message_e2e_${randomUUID()}`,
        question: visibleQuestion,
        retry_of_run_id: null,
        role: "user",
        run_id: runId,
        run_state: runState,
        schema_version: "dev_transcript_entry.v1",
        scope,
    });
    if (terminal?.event === "answer.completed") {
        const answer = terminal.answer as JsonRecord;
        stored.items.push({
            answer,
            created_at: nowIso,
            message_id: `message_e2e_${randomUUID()}`,
            question: null,
            retry_of_run_id: null,
            role: "assistant",
            run_id: runId,
            run_state: runState,
            schema_version: "dev_transcript_entry.v1",
            scope: null,
        });
        stored.conversation.latest_answer_id = answer.answer_id;
    }
    stored.conversation.message_count = (stored.conversation.message_count as number) + 1;
    stored.conversation.updated_at = nowIso;

    return { frames: encodeSseFrames(events), replayed: false };
}

export function expandEvidence(evidenceRefId: string, answerId: string): JsonRecord {
    evidenceCounter += 1;
    const safeExcerpt = `UNTRUSTED_DATA\nEvidence excerpt ${evidenceCounter} for ${answerId}\nEND_UNTRUSTED_DATA`;
    return {
        evidence: {
            citation_text: "The contract implementation remains in progress.",
            confidence: 1,
            display_label: "Implement contract baseline",
            entity_id: "item_01",
            entity_type: "work_item",
            evidence_ref_id: evidenceRefId,
            flags: {
                conflicting: false,
                deleted: false,
                redacted: false,
                stale: false,
                unavailable: false,
                uncertain: false,
                untrusted_content: true,
            },
            freshness: "fresh",
            link: { internal_path: "/work/items/item_01", source_url: null },
            observed_at: "2026-07-28T12:00:00Z",
            provenance: "Canonical work graph projection",
            repository_ids: ["repo_dev_health"],
            schema_version: "dev_evidence_ref.v1",
            source_system: "work_graph",
            source_version: "work_graph.v1",
            valid_entity_ids: ["item_01"],
        },
        query_version: "get_evidence.v1",
        safe_excerpt: safeExcerpt,
        schema_version: "dev_evidence_expansion.v1",
        // Must equal the byte length of `safe_excerpt` itself (the whole
        // UNTRUSTED_DATA-wrapped string), not just its inner text — the
        // client's semantic validator (contractValidation.ts) rejects the
        // response otherwise, exactly the kind of drift this deterministic
        // mock is supposed to force out into the open.
        serialized_bytes: new TextEncoder().encode(safeExcerpt).byteLength,
        state: "available",
        warning: null,
    };
}

export function submitFeedback(answerId: string, rating: string, reasons: unknown): JsonRecord {
    return {
        answer_id: answerId,
        comment: null,
        created_at: new Date().toISOString(),
        feedback_id: `feedback_e2e_${randomUUID()}`,
        rating,
        reasons: Array.isArray(reasons) ? reasons : [],
        schema_version: "dev_feedback.v1",
    };
}
