"use client";

import { useMemo, useState } from "react";

import type { DevAnswer, DevEvidenceExpansion } from "@/lib/dev/generated";
import {
    buildInternalTokenDenylist,
    findInternalToken,
    NEVER_ATTESTABLE_TOKENS,
    safeCopy,
    WITHHELD_COPY,
} from "@/lib/dev/internalTokens";

import { AnswerHeaderSection } from "./answer/AnswerHeaderSection";
import { ClaimsSection } from "./answer/ClaimsSection";
import { ConflictsSection } from "./answer/ConflictsSection";
import { CoverageSection } from "./answer/CoverageSection";
import { EvidenceSection } from "./answer/EvidenceSection";
import { FeedbackFooter, type FeedbackState } from "./answer/FeedbackFooter";
import { FollowUpSection } from "./answer/FollowUpSection";
import type { CitationTargets } from "./answer/InlineCitations";
import type { SafeProse } from "./answer/labels";
import { LimitationsSection } from "./answer/LimitationsSection";
import { MetricsSection } from "./answer/MetricsSection";
import { ScopeSection } from "./answer/ScopeSection";
import { useAskDev } from "./AskDevProvider";

// Grounded in the sanctioned framing from ops/docs/use/ai-workflows/index.md
// ("Ask Dev: window and full-page workspace"): "A partial, degraded,
// refused, or insufficient-evidence answer is a result with limitations,
// not a silent success." `complete` needs no caption (no limitation to
// explain). `error` is also intentionally absent, but for a different reason
// than `complete`: AskDevConversation now routes any transcript entry whose
// `answer.status === "error"` through the same failed/alert treatment as a
// live run failure, so it is never rendered by this component at all
// (CHAOS-3215 M-error-status).
//
// `partial`'s wording must not claim a specific cause: per
// ops/src/dev_health_ops/api/dev/orchestrator.py (`_budget_answer`), PARTIAL
// is also returned when the provider budget/round limit is reached with
// *full* evidence coverage (available_source_count === required_source_count)
// — not only when required evidence was unavailable. That specific claim
// belongs to `insufficient_evidence`, where it is accurate.
// Sanctioned copy for the status pill. A TOTAL map (no Partial, no raw
// enum fallback) so an unmapped AnswerStatus is a type error at build time,
// never a raw internal value reaching the badge at runtime (CHAOS-3291,
// design system A8 "no internal/impl leakage").
// Exported (rather than module-private) so the totality test in
// AskDevAnswer.test.tsx can assert Object.keys(...) coverage against the
// real generated union directly, instead of duplicating a second copy of
// the member list in the test file that could itself drift.
//
// This file is also read as TEXT by tests/ask-dev-vocabulary.spec.ts, which
// locates `export const <NAME> = {` by name to cross-check the keys against
// the pinned JSON Schema enums (it cannot import this module: the "use
// client" graph reaches a PNG asset that Playwright's standalone esbuild
// transform has no loader for). Both label maps below must therefore stay in
// THIS file, in that literal shape — moving them to a sibling module is a
// loud test failure, not a silent one, but a failure with a cause that is
// invisible from the constant's new home.
export const ANSWER_STATUS_LABELS: Record<DevAnswer["status"], string> = {
    complete: "Complete",
    degraded: "Degraded",
    error: "Error",
    insufficient_evidence: "Insufficient evidence",
    partial: "Partial",
    refused: "Refused",
};

// Sanctioned copy for the scope-resolution outcome row. Also TOTAL: the raw
// `forbidden_or_not_found` member previously rendered verbatim as "forbidden
// or not found" — customer-facing copy must not leak that internal
// distinction (the backend deliberately collapses forbidden vs. not-found
// into one outcome so scope resolution can't be used to enumerate what
// exists; the label must preserve that, not re-split it).
//
// `forbidden_or_not_found` reads "No authorized match found" rather than the
// earlier "Not accessible" (CHAOS-3367). Both collapse the forbidden/not-found
// distinction, which is what that comment above is about; "Not accessible" is
// additionally authorization-shaped, and Wave 3.1 PRD §12 forbids an
// authorization-shaped statement unless access was actually denied — which
// this outcome, by construction, cannot tell us. The wording is the TRD §7.1
// public class for the same internal outcome. It lives here rather than being
// mirrored on the ops side: no ops code path renders it, and a constant only
// its own test reads is a coverage claim with nothing behind it.
export const SCOPE_OUTCOME_LABELS: Record<DevAnswer["resolved_scope"]["outcome"], string> = {
    ambiguous: "Ambiguous",
    exact: "Exact match",
    filtered: "Filtered",
    forbidden_or_not_found: "No authorized match found",
    inherited: "Inherited",
    organization_fallback: "Organization-wide",
    unresolved: "Unresolved",
};

// The status pill copy a no-match answer gets instead of its raw
// `AnswerStatus`. §12 prohibits labelling a no-match result as a refusal, and
// the server now terminates these as `insufficient_evidence` — but "Insufficient
// evidence" is also wrong here: there is no evidence problem, the named subject
// simply is not in the authorized catalog. Keyed off the resolution outcome
// rather than the status so it stays correct whichever status a replayed older
// row carries.
export const NO_MATCH_STATUS_LABEL = "No match found";

// The internal-token denylist, derived from the two TOTAL label maps above so
// it cannot fall behind the generated unions. See lib/dev/internalTokens.ts.
export const INTERNAL_TOKEN_DENYLIST = buildInternalTokenDenylist(
    Object.keys(ANSWER_STATUS_LABELS),
    Object.keys(SCOPE_OUTCOME_LABELS),
);

/**
 * Whether this answer's own copy contradicts the scope row it carries.
 *
 * The reported live payload is the reason this exists, and keying only off
 * `resolved_scope.outcome` missed it: that row carries `outcome: "exact"`
 * while its summary says a named subject was not found, so it is an ordinary
 * committed-scope answer as far as the outcome field is concerned. It is
 * already persisted and still schema-valid, so the server-side fix cannot
 * reach it — the client has to notice the contradiction itself.
 *
 * The signal is a scope-resolution token in the answer's own prose. Those
 * tokens are `NEVER_ATTESTABLE_TOKENS`, so no entity label can produce a
 * false positive here, and prose that narrates the resolver's verdict while
 * the scope row claims a commit cannot both be true. When they disagree the
 * scope row is the one that loses: it is the field that would otherwise put
 * "Exact match" beside a not-found statement.
 */
export function contradictsCommittedScope(answer: DevAnswer): boolean {
    const prose = [
        answer.direct_summary,
        ...(answer.warnings ?? []),
        ...(answer.claims ?? []).map((claim) => claim.text),
    ];
    return prose.some((text) => {
        const token = findInternalToken(text, INTERNAL_TOKEN_DENYLIST);
        return token !== null && NEVER_ATTESTABLE_TOKENS.has(token);
    });
}

export function isNoMatchAnswer(answer: DevAnswer): boolean {
    return (
        answer.resolved_scope?.outcome === "forbidden_or_not_found" ||
        contradictsCommittedScope(answer)
    );
}

/**
 * Whether this answer is labelled Refused despite carrying material
 * grounding -- CHAOS-3377 defect 1's client-side backstop.
 *
 * Ops now server-renders an honest, never-Refused status for a NEW run
 * whose tool results include a completion assessment
 * (`status_answer_render.deterministic_answer_status`), and validates that
 * a self-declared `refused` status cannot coexist with real grounding for
 * every other path (`answer_validator.py`'s "refused_with_material_
 * grounding" check). Neither of those can reach a row persisted, or
 * replayed, before this fix existed -- the client has to notice the
 * contradiction itself, exactly as `contradictsCommittedScope` already does
 * for the CHAOS-3367 scope-outcome case this mirrors. "Material grounding"
 * uses the same signal ops's own floor/ceiling checks do: a real claim,
 * metric, or evidence entry -- not just a non-empty array of any shape.
 */
export function refusedDespiteMaterialGrounding(answer: DevAnswer): boolean {
    if (answer.status !== "refused") return false;
    return (
        (answer.metrics?.length ?? 0) > 0 ||
        (answer.evidence?.length ?? 0) > 0 ||
        (answer.claims ?? []).some(
            (claim) =>
                (claim.evidence_ref_ids?.length ?? 0) > 0 ||
                (claim.metric_ref_ids?.length ?? 0) > 0,
        )
    );
}

/**
 * The status pill copy for `refusedDespiteMaterialGrounding`.
 *
 * CHAOS-3377 HIGH (codex adversarial web review, round 2): an earlier
 * revision relabeled this contradiction "Answered" while STILL rendering
 * the model's original (rejected-shaped) `direct_summary`/`claims`
 * underneath -- the ops contract never does that (a refused-with-grounding
 * candidate is either repaired or has its narrative DISCARDED and replaced
 * with server-owned content; see `answer_validator.py` /
 * `Orchestrator._server_grounded_answer`). Labelling this "Answered" while
 * showing the rejected prose invents a coherent answer the server never
 * produced. This is now a genuinely neutral, non-committal label -- content
 * is withheld alongside it (see `refusedWithGrounding` below in the
 * component body), never invented around.
 *
 * The authoritative fix for a NEW run's persisted row is server-side
 * (`no_match_terminal._normalize_refused_with_grounding`, run on every
 * replay/transcript read); this remains only as defense-in-depth for a row
 * that somehow reaches the client without having gone through that
 * normalization.
 */
export const REFUSED_WITH_GROUNDING_STATUS_LABEL = "Inconsistent result";

/** The caption shown in place of `STATUS_EXPLANATIONS` when
 * `refusedWithGrounding` is true -- explains the withholding, not the
 * (rejected) content underneath it. */
export const REFUSED_WITH_GROUNDING_EXPLANATION =
    "Inconsistent result: this answer's recorded status and its own content " +
    "disagree. The original narrative has been withheld; any structured " +
    "metrics or evidence below are unaffected.";

/**
 * Every string in this answer with a server-authorized provenance, joined for
 * the token guard. Read off the answer's OWN scope, candidates, evidence and
 * metrics — never a catalog lookup: an entity that is not already part of this
 * answer has no business exempting a token in it. Mirrors ops
 * `no_match_terminal.attested_strings`.
 */
export function attestedText(answer: DevAnswer): string {
    const scope = answer.resolved_scope;
    return [
        ...(scope?.requested_scope?.entity_refs ?? []).map((ref) => ref.display_label),
        ...(scope?.requested_scope?.repositories ?? []),
        ...(scope?.resolved_scope?.entity_refs ?? []).map((ref) => ref.display_label),
        ...(scope?.resolved_scope?.repositories ?? []),
        ...(scope?.candidates ?? []).map((candidate) => candidate.entity_ref.display_label),
        ...(answer.evidence ?? []).map((item) => item.display_label),
        ...(answer.metrics ?? []).map((metric) => metric.label),
    ].join(" ");
}

const STATUS_EXPLANATIONS: Partial<Record<DevAnswer["status"], string>> = {
    partial:
        "Partial: the investigation did not fully complete. A result with limitations, not a silent success.",
    degraded:
        "Degraded: part of the investigation could not complete as expected. A result with limitations, not a silent success.",
    insufficient_evidence:
        "Insufficient evidence: there isn't enough evidence to answer with confidence. A result with limitations, not a silent success.",
    refused:
        "Refused: Ask Dev did not answer this question. A result with limitations, not a silent success.",
};

/**
 * The answer container.
 *
 * Owns every piece of state, every handler, and every judgement about what
 * this answer is (no-match, refused-with-grounding, trustworthy scope row).
 * The `answer/*` components it composes are presentational: they receive
 * resolved copy, an already-bound `safeProse` sanitizer, and callbacks. That
 * split is what keeps a new section additive — and it is why no section can
 * render model-authored prose without a sanitizer, since it never holds the
 * denylist to forget in the first place.
 */
export function AskDevAnswer({ answer }: { answer: DevAnswer }) {
    const { expandEvidence, selectProposedEntity, submitAnswerFeedback, submitQuestion } =
        useAskDev();
    const [feedback, setFeedback] = useState<FeedbackState>(null);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const [evidenceExpansions, setEvidenceExpansions] = useState<
        Readonly<Record<string, DevEvidenceExpansion>>
    >({});
    const [evidenceErrors, setEvidenceErrors] = useState<Readonly<Record<string, string>>>({});
    const [loadingEvidenceIds, setLoadingEvidenceIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const [openMetricIds, setOpenMetricIds] = useState<ReadonlySet<string>>(() => new Set());
    // CHAOS-3524 (chris's evidence-layout ruling): the evidence LANE
    // (this whole section) and each evidence ROW are independently
    // foldable accordions, both default folded. `evidenceLaneOpen` gates
    // the row list; `openEvidenceRowIds` gates each row's own detail.
    const [evidenceLaneOpen, setEvidenceLaneOpen] = useState(false);
    const [openEvidenceRowIds, setOpenEvidenceRowIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const scopeResolution = answer.resolved_scope;
    // CHAOS-3367. A no-match gets its own presentation rather than the generic
    // status treatment: no "Refused" chip, no status caption claiming Ask Dev
    // declined to answer, and the sanctioned outcome label in place of the raw
    // status. The server's own summary carries the explanation, so a second
    // boilerplate caption above it would only repeat it less accurately.
    const noMatch = isNoMatchAnswer(answer);
    // CHAOS-3377 defect 1. A refusal that carries real claim/metric/evidence
    // grounding is the same class of self-contradiction as a no-match whose
    // scope outcome says "exact" -- a result with content is not a refusal
    // (PRD §12). Checked only when `noMatch` didn't already claim this row
    // (the two are mutually exclusive in practice, but `noMatch` is the more
    // specific, better-understood diagnosis when both could apply).
    const refusedWithGrounding = !noMatch && refusedDespiteMaterialGrounding(answer);
    // A contradictory legacy row's scope outcome is not trustworthy — showing
    // "Exact match" beside a not-found summary is the §12 juxtaposition
    // itself. The row is kept (the repository count beside it is still real)
    // but the outcome value is withheld rather than asserted.
    const scopeOutcomeTrusted = !contradictsCommittedScope(answer);
    const statusLabel = noMatch
        ? NO_MATCH_STATUS_LABEL
        : refusedWithGrounding
          ? REFUSED_WITH_GROUNDING_STATUS_LABEL
          : ANSWER_STATUS_LABELS[answer.status];
    const statusExplanation = noMatch
        ? undefined
        : refusedWithGrounding
          ? REFUSED_WITH_GROUNDING_EXPLANATION
          : STATUS_EXPLANATIONS[answer.status];
    // The coverage row is meaningless when no source plan ran -- "0 of 0
    // sources" reads as a measurement, and the live defect's "1 of 1 sources"
    // read as a completed source plan for a subject that was never resolved.
    // Hidden only when there is genuinely nothing to report. `required_source_count: 0`
    // alone is not enough: the contract permits zero required sources alongside a
    // non-empty unavailable/stale list, and removing the whole block would take the
    // only source-specific explanation with it. A contradictory legacy row is also
    // suppressed — its counts describe a source plan that provably did not run for
    // the subject its own summary says was not found.
    // `degraded_required_sources` belongs in this predicate for the same
    // reason the other two lists do: it is a required source in a state that
    // independently blocks a `complete` answer (ops contracts_v2/compat.py
    // treats degraded exactly as unavailable and stale). Omitting it meant a
    // degraded-only answer rendered no coverage block at all — a visibly
    // downgraded answer with nothing on screen explaining the downgrade
    // (CHAOS-3219 W4).
    const coverage = answer.coverage;
    const showCoverage =
        !noMatch &&
        ((coverage?.required_source_count ?? 0) > 0 ||
            (coverage?.unavailable_required_sources?.length ?? 0) > 0 ||
            (coverage?.degraded_required_sources?.length ?? 0) > 0 ||
            (coverage?.stale_required_sources?.length ?? 0) > 0);
    const attested = useMemo(() => attestedText(answer), [answer]);
    const evidenceById = useMemo(
        () =>
            new Map(
                (answer.evidence ?? []).map((evidence) => [evidence.evidence_ref_id, evidence]),
            ),
        [answer.evidence],
    );
    const evidencePositionById = useMemo(
        () =>
            new Map(
                (answer.evidence ?? []).map((evidence, index) => [evidence.evidence_ref_id, index]),
            ),
        [answer.evidence],
    );
    const metricPositionById = useMemo(
        () => new Map((answer.metrics ?? []).map((metric, index) => [metric.metric_ref_id, index])),
        [answer.metrics],
    );

    // Bound once here, handed to every section that renders model-authored
    // prose. Not a hook: it closes over `attested` and is cheap, and keeping
    // it a plain function means the sections re-render exactly as often as
    // they did when this logic was inline in one component.
    const safeProse: SafeProse = (value) => safeCopy(value, INTERNAL_TOKEN_DENYLIST, attested);

    // Detail-panel ids are scoped by answer.answer_id, not just position: a
    // transcript can contain many answers, and position-only ids (e.g.
    // "ask-dev-evidence-1") collide across every one of them, so
    // focusDetail()/getElementById can jump focus to an earlier answer's panel
    // instead of this one (CHAOS-3215 M6).
    const evidenceAnchorId = (position: number) =>
        `ask-dev-evidence-${answer.answer_id}-${position + 1}`;
    const metricAnchorId = (position: number) =>
        `ask-dev-metric-${answer.answer_id}-${position + 1}`;
    // Section heading ids (used only for aria-labelledby) are static per
    // section kind, so they need the same per-answer scoping to stay unique
    // across a transcript with multiple answers.
    const findingsHeadingId = `ask-dev-findings-${answer.answer_id}`;
    const metricsHeadingId = `ask-dev-metrics-${answer.answer_id}`;
    const evidenceHeadingId = `ask-dev-evidence-heading-${answer.answer_id}`;
    const evidenceListId = `ask-dev-evidence-list-${answer.answer_id}`;

    const focusDetail = (anchorId: string) => {
        requestAnimationFrame(() => {
            document.getElementById(anchorId)?.focus({ preventScroll: false });
        });
    };

    // CHAOS-3524: unfolds the lane and this specific row BEFORE the async
    // fetch below, synchronously in the same event-handler flush — so by
    // the time `focusDetail`'s requestAnimationFrame callback runs (after
    // the fetch resolves, well past this point), React has already
    // committed the row as present/expanded in the DOM for
    // `getElementById`/`.focus()` to find. This is what "clicking an
    // evidence reference unfolds the lane and unfolds+scrolls to that
    // item" resolves to: the citation buttons already call this function.
    const openEvidenceDetail = async (evidenceRefId: string) => {
        const position = evidencePositionById.get(evidenceRefId);
        if (position === undefined || !evidenceById.has(evidenceRefId)) return;
        const anchorId = evidenceAnchorId(position);
        setEvidenceLaneOpen(true);
        setOpenEvidenceRowIds((current) => new Set(current).add(evidenceRefId));
        setLoadingEvidenceIds((current) => new Set(current).add(evidenceRefId));
        setEvidenceErrors((current) => {
            const next = { ...current };
            delete next[evidenceRefId];
            return next;
        });
        try {
            const expansion = await expandEvidence(evidenceRefId, answer.answer_id);
            setEvidenceExpansions((current) => ({ ...current, [evidenceRefId]: expansion }));
            focusDetail(anchorId);
        } catch (caught) {
            setEvidenceErrors((current) => ({
                ...current,
                [evidenceRefId]:
                    caught instanceof Error ? caught.message : "Evidence detail is unavailable.",
            }));
            focusDetail(anchorId);
        } finally {
            setLoadingEvidenceIds((current) => {
                const next = new Set(current);
                next.delete(evidenceRefId);
                return next;
            });
        }
    };

    const openMetricDetail = (metricRefId: string) => {
        const position = metricPositionById.get(metricRefId);
        if (position === undefined) return;
        setOpenMetricIds((current) => new Set(current).add(metricRefId));
        focusDetail(metricAnchorId(position));
    };

    const toggleEvidenceRow = (evidenceRefId: string) => {
        setOpenEvidenceRowIds((current) => {
            const next = new Set(current);
            if (next.has(evidenceRefId)) next.delete(evidenceRefId);
            else next.add(evidenceRefId);
            return next;
        });
    };

    // CHAOS-3524: the "unfold all" affordance chris asked for — expands the
    // lane and every row in one action, independent of the two accordion
    // levels' individual toggles above.
    const unfoldAllEvidence = () => {
        setEvidenceLaneOpen(true);
        setOpenEvidenceRowIds(new Set((answer.evidence ?? []).map((item) => item.evidence_ref_id)));
    };

    const citationTargets: CitationTargets = {
        evidencePositionById,
        metricPositionById,
        loadingEvidenceIds,
        openEvidence: (evidenceRefId) => void openEvidenceDetail(evidenceRefId),
        openMetric: openMetricDetail,
    };

    const sendFeedback = async (rating: "helpful" | "not_helpful") => {
        setFeedback("saving");
        setFeedbackError(null);
        try {
            await submitAnswerFeedback(answer.answer_id, rating);
            setFeedback(rating);
        } catch (caught) {
            setFeedback(null);
            setFeedbackError(
                caught instanceof Error ? caught.message : "Feedback could not be saved.",
            );
        }
    };

    return (
        <article
            id={`ask-dev-answer-${answer.answer_id}`}
            tabIndex={-1}
            className="space-y-5 outline-none"
            aria-label="Ask Dev answer"
        >
            <AnswerHeaderSection
                asOf={answer.as_of}
                statusExplanation={statusExplanation}
                statusLabel={statusLabel}
                summary={refusedWithGrounding ? WITHHELD_COPY : safeProse(answer.direct_summary)}
            />

            {scopeResolution ? (
                <ScopeSection
                    noMatch={noMatch}
                    onSelectCandidate={selectProposedEntity}
                    outcomeLabel={
                        scopeOutcomeTrusted
                            ? SCOPE_OUTCOME_LABELS[scopeResolution.outcome]
                            : SCOPE_OUTCOME_LABELS.forbidden_or_not_found
                    }
                    scopeResolution={scopeResolution}
                />
            ) : null}

            {showCoverage ? <CoverageSection coverage={answer.coverage} /> : null}

            {/*
             * CHAOS-3377 HIGH: claims are model-authored prose, exactly
             * like direct_summary above -- a refused-with-grounding row's
             * claims are withheld the same way, never rendered alongside a
             * relabeled-but-invented status.
             */}
            {!refusedWithGrounding && answer.claims?.length ? (
                <ClaimsSection
                    claims={answer.claims}
                    headingId={findingsHeadingId}
                    safeProse={safeProse}
                    targets={citationTargets}
                />
            ) : null}

            {answer.conflicts?.length ? (
                <ConflictsSection conflicts={answer.conflicts} safeProse={safeProse} />
            ) : null}

            {answer.metrics?.length ? (
                <MetricsSection
                    headingId={metricsHeadingId}
                    metricAnchorId={metricAnchorId}
                    metricPositionById={metricPositionById}
                    metrics={answer.metrics}
                    openMetricIds={openMetricIds}
                    targets={citationTargets}
                />
            ) : null}

            {answer.evidence?.length ? (
                <EvidenceSection
                    evidence={answer.evidence}
                    evidenceAnchorId={evidenceAnchorId}
                    evidenceErrors={evidenceErrors}
                    evidenceExpansions={evidenceExpansions}
                    evidencePositionById={evidencePositionById}
                    headingId={evidenceHeadingId}
                    laneOpen={evidenceLaneOpen}
                    listId={evidenceListId}
                    loadingEvidenceIds={loadingEvidenceIds}
                    onOpenExpansion={openEvidenceDetail}
                    onToggleLane={() => setEvidenceLaneOpen((open) => !open)}
                    onToggleRow={toggleEvidenceRow}
                    onUnfoldAll={unfoldAllEvidence}
                    openEvidenceRowIds={openEvidenceRowIds}
                />
            ) : null}

            {answer.warnings?.length ? (
                <LimitationsSection safeProse={safeProse} warnings={answer.warnings} />
            ) : null}

            {answer.suggested_follow_up_questions?.length ? (
                <FollowUpSection
                    onAsk={(question) => void submitQuestion(question)}
                    questions={answer.suggested_follow_up_questions}
                    safeProse={safeProse}
                />
            ) : null}

            <FeedbackFooter
                error={feedbackError}
                onRate={(rating) => void sendFeedback(rating)}
                state={feedback}
            />
        </article>
    );
}
