"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";
import type {
    DevAnswer,
    DevEvidenceExpansion,
    DevEvidenceRef,
    DevScope,
} from "@/lib/dev/generated";
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
export const SCOPE_OUTCOME_LABELS: Record<DevAnswer["resolved_scope"]["outcome"], string> = {
    ambiguous: "Ambiguous",
    exact: "Exact match",
    filtered: "Filtered",
    forbidden_or_not_found: "Not accessible",
    inherited: "Inherited",
    organization_fallback: "Organization-wide",
    unresolved: "Unresolved",
};

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

function EvidenceRow({
    anchorId,
    error,
    evidence,
    expansion,
    loading,
    openExpansion,
}: {
    anchorId: string;
    error: string | null;
    evidence: DevEvidenceRef;
    expansion: DevEvidenceExpansion | null;
    loading: boolean;
    openExpansion: () => Promise<void>;
}) {
    const internalPath = evidence.link?.internal_path;

    return (
        <div
            id={anchorId}
            tabIndex={-1}
            className="scroll-mt-6 space-y-1.5 border-l-2 border-(--border) pl-3 outline-none focus-visible:border-(--accent)"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-(--text-secondary)">
                        {evidence.display_label}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                        {evidence.provenance} · {formatTimestamp(evidence.observed_at)}
                    </span>
                </div>
                {/*
                 * Quiet by default (text-muted, no fill) — this is a
                 * secondary, on-demand affordance, not a primary CTA; it
                 * only picks up accent color on hover/focus (CHAOS-3291).
                 */}
                <button
                    type="button"
                    onClick={() => void openExpansion()}
                    disabled={loading}
                    className="rounded-(--radius-sm) px-2 py-1 text-xs font-medium text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                >
                    {loading ? "Opening…" : CTA_LABELS.openEvidence}
                </button>
            </div>
            {evidence.citation_text ? (
                <p className="text-xs leading-5 text-(--text-muted)">{evidence.citation_text}</p>
            ) : null}
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
    const scopeResolution = answer.resolved_scope;
    const statusExplanation = STATUS_EXPLANATIONS[answer.status];
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

    const focusDetail = (anchorId: string) => {
        requestAnimationFrame(() => {
            document.getElementById(anchorId)?.focus({ preventScroll: false });
        });
    };

    const openEvidenceDetail = async (evidenceRefId: string) => {
        const position = evidencePositionById.get(evidenceRefId);
        if (position === undefined || !evidenceById.has(evidenceRefId)) return;
        const anchorId = evidenceAnchorId(position);
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
                    {ANSWER_STATUS_LABELS[answer.status]}
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
                    {answer.direct_summary}
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
                                {SCOPE_OUTCOME_LABELS[scopeResolution.outcome]}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            {scopeResolution.authorized_repository_ids?.length ?? 0} authorized
                            repositories
                        </span>
                    </div>
                    {scopeResolution.candidates?.length ? (
                        <div className="mt-3">
                            <p className="text-label-caps text-(--caution)">
                                Possible scope matches
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
                                Choose or remove the proposed context before asking the next
                                question.
                            </p>
                        </div>
                    ) : null}
                </section>
            ) : null}

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
                {answer.coverage?.stale_required_sources?.length ? (
                    <span className="text-(--caution)">
                        {answer.coverage.stale_required_sources.length} required sources stale
                    </span>
                ) : null}
            </section>

            {answer.claims?.length ? (
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
                                        {claim.text}
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
                            <li key={conflict.summary}>{conflict.summary}</li>
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
                    <h3 id={evidenceHeadingId} className="text-label-caps text-(--text-muted)">
                        Evidence
                    </h3>
                    <div className="space-y-3">
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
                            <li key={warning}>{warning}</li>
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
                                {question}
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
