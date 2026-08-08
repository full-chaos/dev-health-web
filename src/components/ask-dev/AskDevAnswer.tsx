"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CTA_LABELS, toggleEvidenceItem } from "@/lib/design/cta";
import type {
    DevAnswer,
    DevEvidenceExpansion,
    DevEvidenceRef,
    DevScope,
} from "@/lib/dev/generated";
import {
    buildInternalTokenDenylist,
    findInternalToken,
    NEVER_ATTESTABLE_TOKENS,
    safeCopy,
    WITHHELD_COPY,
} from "@/lib/dev/internalTokens";
import { formatMetricValue, formatNumber, formatPercent, formatTimestamp } from "@/lib/formatters";

import { useAskDev } from "./AskDevProvider";

function safeExcerpt(value: string | null | undefined): string | null {
    if (!value) return null;
    return value.replace(/^UNTRUSTED_DATA\r?\n/u, "").replace(/\r?\nEND_UNTRUSTED_DATA$/u, "");
}

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

function validityScopeLabel(scope: DevScope | null | undefined): string | null {
    if (!scope) return null;
    const namedEntity = scope.entity_refs?.find(
        (entity) => entity.entity_type === scope.direct_scope,
    );
    if (namedEntity) return namedEntity.display_label;
    if (scope.direct_scope === "organization") return "Organization";
    const count =
        scope.direct_scope === "repository"
            ? (scope.repositories?.length ?? 0)
            : (scope.entity_refs?.filter((entity) => entity.entity_type === scope.direct_scope)
                  .length ?? 0);
    const label = scope.direct_scope.replaceAll("_", " ");
    return count > 0 ? `${count} ${label}${count === 1 ? "" : "s"}` : label;
}

/**
 * The scope-outcome row's secondary line (CHAOS-3377 defect 4).
 *
 * Previously always rendered "{authorized_repository_ids.length} authorized
 * repositories", regardless of the resolved scope's own kind -- correct for
 * a REPOSITORY-scoped answer, but for a PROJECT (or any other non-repository)
 * scope the repository count is at best incidental and at worst reads as
 * "0 authorized repositories" for a subject that has real, substantive
 * content and simply carries no repository dimension on the wire (see
 * ops's `ScopeResolutionService`/`DevScope.repositories`, which is only
 * ever populated for a REPOSITORY commit). Reuses `validityScopeLabel` --
 * the same "name the subject, not a count" logic `claim.validity_scope`
 * already renders -- so a project scope shows its subject ("Falcon Nine")
 * instead. Falls back to the repository count whenever the scope itself is
 * missing or genuinely repository-scoped, which is unchanged behavior.
 */
function scopeCoverageLabel(scopeResolution: NonNullable<DevAnswer["resolved_scope"]>): string {
    const scope = scopeResolution.resolved_scope ?? scopeResolution.requested_scope;
    if (scope && scope.direct_scope !== "repository") {
        const subjectLabel = validityScopeLabel(scope);
        if (subjectLabel) return subjectLabel;
    }
    const count = scopeResolution.authorized_repository_ids?.length ?? 0;
    return `${count} authorized repositories`;
}

/**
 * CHAOS-3524 (chris's evidence-layout ruling): each evidence item is its own
 * accordion row, default folded. The row's header (label + provenance) stays
 * visible even folded — that's the disclosure trigger a reader sees and
 * clicks — only the detail beneath it (citation text, the "Open evidence"
 * fetch action, the fetched excerpt, errors, the artifact link) is hidden
 * until `open`. The fold toggle itself is icon-only (a chevron, aria-label
 * carries the real name) per chris's "buttons/iconography only, no text
 * labels" rule; `evidence.display_label` sitting in the same clickable
 * header is the row's identifying TITLE, not an instructional fold/unfold
 * label, so it stays as visible text.
 */
function EvidenceRow({
    anchorId,
    error,
    evidence,
    expansion,
    loading,
    onToggleOpen,
    open,
    openExpansion,
}: {
    anchorId: string;
    error: string | null;
    evidence: DevEvidenceRef;
    expansion: DevEvidenceExpansion | null;
    loading: boolean;
    onToggleOpen: () => void;
    open: boolean;
    openExpansion: () => Promise<void>;
}) {
    const internalPath = evidence.link?.internal_path;

    return (
        <div
            id={anchorId}
            tabIndex={-1}
            className="scroll-mt-6 space-y-1.5 border-l-2 border-(--border) pl-3 outline-none focus-visible:border-(--accent)"
        >
            <button
                type="button"
                onClick={onToggleOpen}
                aria-expanded={open}
                aria-label={toggleEvidenceItem(evidence.display_label, open)}
                className="flex w-full min-w-0 items-start gap-2 rounded-(--radius-sm) py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
            >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-(--text-muted)">
                    {open ? "▾" : "▸"}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-(--text-secondary)">
                        {evidence.display_label}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                        {evidence.provenance} · {formatTimestamp(evidence.observed_at)}
                    </span>
                </span>
            </button>
            {open ? (
                <div className="space-y-1.5 pl-5">
                    {evidence.citation_text ? (
                        <p className="text-xs leading-5 text-(--text-muted)">
                            {evidence.citation_text}
                        </p>
                    ) : null}
                    {/*
                     * Quiet by default (text-muted, no fill) — this is a
                     * secondary, on-demand affordance, not a primary CTA; it
                     * only picks up accent color on hover/focus (CHAOS-3291).
                     * Unlike the fold toggle above, this triggers a real
                     * server fetch (the deep excerpt) rather than showing
                     * already-loaded content, so it keeps its sanctioned
                     * text label rather than becoming icon-only.
                     */}
                    <button
                        type="button"
                        onClick={() => void openExpansion()}
                        disabled={loading}
                        className="rounded-(--radius-sm) px-2 py-1 text-xs font-medium text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                    >
                        {loading ? "Opening…" : CTA_LABELS.openEvidence}
                    </button>
                    {expansion ? (
                        <div className="rounded-(--radius-md) bg-(--background)/60 p-3 text-sm leading-6 text-(--text-secondary)">
                            <p className="text-label-caps text-(--text-muted)">
                                {expansion.state.replaceAll("_", " ")}
                            </p>
                            {safeExcerpt(expansion.safe_excerpt) ? (
                                <p className="mt-2 whitespace-pre-wrap">
                                    {safeExcerpt(expansion.safe_excerpt)}
                                </p>
                            ) : (
                                <p className="mt-2">No additional excerpt is available.</p>
                            )}
                            {expansion.warning ? (
                                <p className="mt-2 text-(--caution)">{expansion.warning}</p>
                            ) : null}
                        </div>
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-xs text-(--negative)">
                            {error}
                        </p>
                    ) : null}
                    {internalPath ? (
                        <Link
                            href={internalPath}
                            className="inline-flex text-xs font-medium text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                        >
                            {CTA_LABELS.openArtifact}
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export function AskDevAnswer({ answer }: { answer: DevAnswer }) {
    const { expandEvidence, selectProposedEntity, submitAnswerFeedback, submitQuestion } =
        useAskDev();
    const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | "saving" | null>(null);
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

    const renderInlineCitations = (
        evidenceRefIds: readonly string[] = [],
        metricRefIds: readonly string[] = [],
        ownerLabel: string,
    ) => {
        const knownEvidenceRefs = evidenceRefIds.filter((id) => evidencePositionById.has(id));
        const knownMetricRefs = metricRefIds.filter((id) => metricPositionById.has(id));
        if (!knownEvidenceRefs.length && !knownMetricRefs.length) return null;

        return (
            <span
                className="ml-2 inline-flex flex-wrap gap-1 align-baseline"
                aria-label="Citations"
            >
                {knownEvidenceRefs.map((evidenceRefId) => {
                    const position = evidencePositionById.get(evidenceRefId)!;
                    return (
                        <button
                            key={evidenceRefId}
                            type="button"
                            onClick={() => void openEvidenceDetail(evidenceRefId)}
                            disabled={loadingEvidenceIds.has(evidenceRefId)}
                            aria-label={`Open evidence citation ${position + 1} for ${ownerLabel}`}
                            className="rounded-(--radius-sm) bg-(--accent)/10 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium leading-none text-(--accent) hover:bg-(--accent)/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                        >
                            E{position + 1}
                        </button>
                    );
                })}
                {knownMetricRefs.map((metricRefId) => {
                    const position = metricPositionById.get(metricRefId)!;
                    return (
                        <button
                            key={metricRefId}
                            type="button"
                            onClick={() => openMetricDetail(metricRefId)}
                            aria-label={`Open metric citation ${position + 1} for ${ownerLabel}`}
                            className="rounded-(--radius-sm) bg-(--accent-ai)/10 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium leading-none text-(--accent-ai) hover:bg-(--accent-ai)/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                        >
                            M{position + 1}
                        </button>
                    );
                })}
            </span>
        );
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
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-(--radius-pill) bg-(--accent-ai)/12 px-2.5 py-1 text-label-caps text-(--accent-ai)">
                    AI-generated
                </span>
                <span className="rounded-(--radius-pill) border border-(--border) px-2.5 py-1 text-label-caps text-(--text-muted)">
                    {statusLabel}
                </span>
                <span className="text-xs text-(--text-muted)">
                    As of {formatTimestamp(answer.as_of)}
                </span>
            </div>

            {/*
             * The direct answer is the primary content (TRD §16: scope →
             * question → answer → evidence/metrics → follow-up; CHAOS-3291).
             * Previously the status caption rendered as an isolated text-xs
             * line and direct_summary as plain text-body — same visual
             * weight as the supporting chrome below it, so a thin answer
             * (e.g. "Status: partial.") read as smaller and less important
             * than the Evidence block. Keeping the caption tightly coupled
             * to the summary (one block, no separating chrome) and giving
             * the summary the same display-font treatment used for section
             * headings elsewhere makes it read as one coherent answer
             * rather than badge + boilerplate + terse line.
             */}
            <div className="space-y-1.5">
                {statusExplanation ? (
                    <p className="text-sm leading-6 text-(--text-secondary)">{statusExplanation}</p>
                ) : null}
                <p className="font-(--font-display) text-h3 text-(--text-primary)">
                    {refusedWithGrounding
                        ? WITHHELD_COPY
                        : safeCopy(answer.direct_summary, INTERNAL_TOKEN_DENYLIST, attested)}
                </p>
            </div>

            {scopeResolution ? (
                <section
                    className="border-y border-(--border) py-3"
                    aria-label="Resolved answer scope"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-(--text-muted)">
                            Scope outcome:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {scopeOutcomeTrusted
                                    ? SCOPE_OUTCOME_LABELS[scopeResolution.outcome]
                                    : SCOPE_OUTCOME_LABELS.forbidden_or_not_found}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            {scopeCoverageLabel(scopeResolution)}
                        </span>
                    </div>
                    {scopeResolution.candidates?.length ? (
                        <div className="mt-3">
                            {/*
                             * Two different situations share this list.
                             * Ambiguity means several authorized entities DID
                             * match and one must be picked; a no-match means
                             * none did and these are only the nearest names
                             * (CHAOS-3366 fills them; empty today). Calling
                             * the second "possible scope matches" would assert
                             * the subject exists, which is the substitution
                             * §12 prohibits.
                             */}
                            <p className="text-label-caps text-(--caution)">
                                {noMatch ? "Closest matches" : "Possible scope matches"}
                            </p>
                            <ul className="mt-2 space-y-1 text-sm text-(--text-secondary)">
                                {scopeResolution.candidates.map((candidate) => (
                                    <li
                                        key={`${candidate.entity_ref.entity_type}:${candidate.entity_ref.entity_id}`}
                                        className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                        <span>
                                            {candidate.entity_ref.display_label} —{" "}
                                            {candidate.reason}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                selectProposedEntity(candidate.entity_ref)
                                            }
                                            className="rounded-(--radius-sm) border border-(--border) px-2 py-1 text-xs font-medium hover:border-(--accent)/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                                        >
                                            {CTA_LABELS.useAskDevScope}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-(--text-muted)">
                                {noMatch
                                    ? "None of these is the subject you named. Pick one to ask about it instead."
                                    : "Choose or remove the proposed context before asking the next question."}
                            </p>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {showCoverage ? (
                <section
                    aria-label="Evidence coverage"
                    className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-(--text-muted)"
                >
                    <span>
                        Coverage:{" "}
                        {formatNumber(answer.coverage?.available_source_count ?? 0, {
                            maximumFractionDigits: 0,
                        })}{" "}
                        of{" "}
                        {formatNumber(answer.coverage?.required_source_count ?? 0, {
                            maximumFractionDigits: 0,
                        })}{" "}
                        sources
                    </span>
                    {answer.coverage?.unavailable_required_sources?.length ? (
                        <span className="text-(--caution)">
                            {answer.coverage.unavailable_required_sources.length} required sources
                            unavailable
                        </span>
                    ) : null}
                    {answer.coverage?.degraded_required_sources?.length ? (
                        <span className="text-(--caution)">
                            {answer.coverage.degraded_required_sources.length} required sources
                            degraded
                        </span>
                    ) : null}
                    {answer.coverage?.stale_required_sources?.length ? (
                        <span className="text-(--caution)">
                            {answer.coverage.stale_required_sources.length} required sources stale
                        </span>
                    ) : null}
                </section>
            ) : null}

            {/*
             * CHAOS-3377 HIGH: claims are model-authored prose, exactly
             * like direct_summary above -- a refused-with-grounding row's
             * claims are withheld the same way, never rendered alongside a
             * relabeled-but-invented status.
             */}
            {!refusedWithGrounding && answer.claims?.length ? (
                <section
                    className="space-y-3 border-t border-(--border) pt-4"
                    aria-labelledby={findingsHeadingId}
                >
                    <h3 id={findingsHeadingId} className="text-label-caps text-(--text-muted)">
                        What the evidence suggests
                    </h3>
                    <ul className="space-y-3">
                        {answer.claims.map((claim) => (
                            <li key={claim.claim_id} className="flex gap-3 text-sm leading-6">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                                <div className="min-w-0">
                                    <p>
                                        {safeCopy(claim.text, INTERNAL_TOKEN_DENYLIST, attested)}
                                        {renderInlineCitations(
                                            claim.evidence_ref_ids,
                                            claim.metric_ref_ids,
                                            "claim",
                                        )}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-muted)">
                                        <span>
                                            {claim.kind.replaceAll("_", " ")} ·{" "}
                                            {formatPercent(claim.confidence * 100)} confidence
                                        </span>
                                        {validityScopeLabel(claim.validity_scope) ? (
                                            <span>
                                                Applies to{" "}
                                                {validityScopeLabel(claim.validity_scope)}
                                            </span>
                                        ) : null}
                                        {claim.flags.stale ? (
                                            <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                                Stale
                                            </span>
                                        ) : null}
                                        {claim.flags.uncertain ? (
                                            <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                                Uncertain
                                            </span>
                                        ) : null}
                                        {claim.flags.conflicting ? (
                                            <span className="rounded-(--radius-pill) bg-(--caution)/10 px-2 text-(--caution)">
                                                Conflicting
                                            </span>
                                        ) : null}
                                        {claim.flags.untrusted_source ? (
                                            <span className="rounded-(--radius-pill) bg-(--negative)/10 px-2 text-(--negative)">
                                                Untrusted source
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {answer.conflicts?.length ? (
                <section
                    className="rounded-(--radius-md) border border-(--caution)/30 bg-(--caution)/8 p-3"
                    aria-label="Conflicting evidence"
                >
                    <p className="text-label-caps text-(--caution)">Conflicting evidence</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--text-secondary)">
                        {answer.conflicts.map((conflict) => (
                            <li key={conflict.summary}>
                                {safeCopy(conflict.summary, INTERNAL_TOKEN_DENYLIST, attested)}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {answer.metrics?.length ? (
                <section
                    className="border-t border-(--border) pt-4"
                    aria-labelledby={metricsHeadingId}
                >
                    <h3 id={metricsHeadingId} className="text-label-caps text-(--text-muted)">
                        Metrics
                    </h3>
                    <dl className="mt-2 divide-y divide-(--border)">
                        {answer.metrics.map((metric) => (
                            <div
                                key={metric.metric_ref_id}
                                id={metricAnchorId(
                                    metricPositionById.get(metric.metric_ref_id) ?? 0,
                                )}
                                tabIndex={-1}
                                className="scroll-mt-6 grid gap-1 py-3 outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
                            >
                                <dt className="text-sm text-(--text-secondary)">
                                    {metric.label}
                                    {renderInlineCitations(
                                        metric.evidence_ref_ids,
                                        [],
                                        `metric ${metric.label}`,
                                    )}
                                    <span className="mt-0.5 block text-xs text-(--text-muted)">
                                        {metric.aggregation} · {metric.freshness} ·{" "}
                                        {formatPercent(metric.coverage * 100)} coverage
                                    </span>
                                </dt>
                                <dd className="text-left sm:text-right">
                                    <span className="font-(--font-display) text-h3 text-(--text-primary)">
                                        {metric.value == null
                                            ? "Unavailable"
                                            : formatMetricValue(metric.value, metric.unit)}
                                    </span>
                                    {metric.comparison_value != null ? (
                                        <span className="ml-2 text-xs text-(--text-muted)">
                                            vs{" "}
                                            {formatMetricValue(
                                                metric.comparison_value,
                                                metric.unit,
                                            )}
                                        </span>
                                    ) : null}
                                    <details
                                        open={openMetricIds.has(metric.metric_ref_id) || undefined}
                                        className="mt-1 text-xs text-(--text-muted)"
                                    >
                                        <summary className="cursor-pointer font-medium text-(--text-secondary)">
                                            Metric definition
                                        </summary>
                                        <dl className="mt-2 grid gap-x-3 gap-y-1 text-left sm:grid-cols-[auto_minmax(0,1fr)]">
                                            <dt>Unit</dt>
                                            <dd>{metric.unit}</dd>
                                            <dt>Definition version</dt>
                                            <dd>{metric.definition_version}</dd>
                                            <dt>Query version</dt>
                                            <dd>{metric.query_version}</dd>
                                            <dt>Source version</dt>
                                            <dd>{metric.source_version}</dd>
                                            <dt>Current window</dt>
                                            <dd>
                                                {formatTimestamp(metric.current_window.start)} –{" "}
                                                {formatTimestamp(metric.current_window.end)}
                                            </dd>
                                            {metric.comparison_window ? (
                                                <>
                                                    <dt>Comparison window</dt>
                                                    <dd>
                                                        {formatTimestamp(
                                                            metric.comparison_window.start,
                                                        )}{" "}
                                                        –{" "}
                                                        {formatTimestamp(
                                                            metric.comparison_window.end,
                                                        )}
                                                    </dd>
                                                </>
                                            ) : null}
                                        </dl>
                                    </details>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ) : null}

            {answer.evidence?.length ? (
                <section
                    className="space-y-3 border-t border-(--border) pt-4"
                    aria-labelledby={evidenceHeadingId}
                >
                    {/*
                     * CHAOS-3524: the lane's own fold toggle and the
                     * "unfold all" action are icon-only buttons (chevron /
                     * unfold glyph, aria-label carries the name) — "Evidence"
                     * is the section's static title, not itself a
                     * fold/unfold instruction, so it stays outside both
                     * buttons as plain heading text.
                     */}
                    <div className="flex items-center justify-between gap-2">
                        <h3 id={evidenceHeadingId} className="text-label-caps text-(--text-muted)">
                            Evidence
                        </h3>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={unfoldAllEvidence}
                                aria-label={CTA_LABELS.unfoldAllEvidence}
                                className="rounded-(--radius-sm) p-1 text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                            >
                                <span aria-hidden="true">⤢</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setEvidenceLaneOpen((open) => !open)}
                                aria-expanded={evidenceLaneOpen}
                                aria-controls={evidenceListId}
                                aria-label={
                                    evidenceLaneOpen
                                        ? CTA_LABELS.collapseEvidenceLane
                                        : CTA_LABELS.expandEvidenceLane
                                }
                                className="rounded-(--radius-sm) p-1 text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                            >
                                <span aria-hidden="true">{evidenceLaneOpen ? "▾" : "▸"}</span>
                            </button>
                        </div>
                    </div>
                    {/*
                     * Native `hidden` attribute, not a conditional
                     * unmount/CSS-class toggle: this codebase's tests run
                     * without compiled Tailwind CSS (a `hidden` class
                     * wouldn't actually hide anything for `toBeVisible()`
                     * purposes), but the native attribute is a real HTML5 UA
                     * behavior jsdom honors directly. Keeping the rows
                     * always mounted (just hidden) also means
                     * `document.getElementById(anchorId)` keeps working
                     * immediately when a citation click both unfolds the
                     * lane and focuses a row in the same flow, with no
                     * mount-timing race to reason about.
                     */}
                    <div id={evidenceListId} hidden={!evidenceLaneOpen} className="space-y-3">
                        {answer.evidence.map((evidence) => (
                            <EvidenceRow
                                key={evidence.evidence_ref_id}
                                anchorId={evidenceAnchorId(
                                    evidencePositionById.get(evidence.evidence_ref_id) ?? 0,
                                )}
                                error={evidenceErrors[evidence.evidence_ref_id] ?? null}
                                evidence={evidence}
                                expansion={evidenceExpansions[evidence.evidence_ref_id] ?? null}
                                loading={loadingEvidenceIds.has(evidence.evidence_ref_id)}
                                onToggleOpen={() => toggleEvidenceRow(evidence.evidence_ref_id)}
                                open={openEvidenceRowIds.has(evidence.evidence_ref_id)}
                                openExpansion={() => openEvidenceDetail(evidence.evidence_ref_id)}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            {answer.warnings?.length ? (
                <section
                    className="rounded-(--radius-md) border border-(--caution)/30 bg-(--caution)/8 p-3"
                    aria-label="Answer limitations"
                >
                    <p className="text-label-caps text-(--caution)">Limitations</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--text-secondary)">
                        {answer.warnings.map((warning) => (
                            <li key={warning}>
                                {safeCopy(warning, INTERNAL_TOKEN_DENYLIST, attested)}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {answer.suggested_follow_up_questions?.length ? (
                <section
                    className="space-y-2 border-t border-(--border) pt-4"
                    aria-label="Suggested follow-up questions"
                >
                    <p className="text-label-caps text-(--text-muted)">Ask next</p>
                    <div className="flex flex-wrap gap-2">
                        {answer.suggested_follow_up_questions.map((question) => (
                            <button
                                key={question}
                                type="button"
                                onClick={() => void submitQuestion(question)}
                                className="rounded-(--radius-pill) border border-(--border) px-3 py-1.5 text-left text-xs text-(--text-secondary) hover:border-(--accent)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                            >
                                {safeCopy(question, INTERNAL_TOKEN_DENYLIST, attested)}
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}

            <footer className="flex flex-wrap items-center gap-2 border-t border-(--border) pt-4">
                <span className="mr-1 text-xs text-(--text-muted)">Was this useful?</span>
                <button
                    type="button"
                    disabled={feedback === "saving" || feedback === "helpful"}
                    onClick={() => void sendFeedback("helpful")}
                    className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--positive)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--positive)/45 disabled:opacity-55"
                >
                    {CTA_LABELS.askDevHelpful}
                </button>
                <button
                    type="button"
                    disabled={feedback === "saving" || feedback === "not_helpful"}
                    onClick={() => void sendFeedback("not_helpful")}
                    className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--caution)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--caution)/45 disabled:opacity-55"
                >
                    {CTA_LABELS.askDevNotHelpful}
                </button>
                {feedback === "helpful" || feedback === "not_helpful" ? (
                    <span role="status" className="text-xs text-(--positive)">
                        Feedback saved.
                    </span>
                ) : null}
                {feedbackError ? (
                    <span role="alert" className="text-xs text-(--negative)">
                        {feedbackError}
                    </span>
                ) : null}
            </footer>
        </article>
    );
}
