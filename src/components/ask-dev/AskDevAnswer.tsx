"use client";

import Link from "next/link";
import { useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";
import type { DevAnswer, DevEvidenceExpansion, DevEvidenceRef } from "@/lib/dev/generated";
import { formatMetricValue, formatNumber, formatPercent, formatTimestamp } from "@/lib/formatters";

import { useAskDev } from "./AskDevProvider";

function safeExcerpt(value: string | null | undefined): string | null {
    if (!value) return null;
    return value.replace(/^UNTRUSTED_DATA\r?\n/u, "").replace(/\r?\nEND_UNTRUSTED_DATA$/u, "");
}

function EvidenceRow({ answerId, evidence }: { answerId: string; evidence: DevEvidenceRef }) {
    const { expandEvidence } = useAskDev();
    const [expansion, setExpansion] = useState<DevEvidenceExpansion | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const internalPath = evidence.link?.internal_path;

    const openExpansion = async () => {
        setLoading(true);
        setError(null);
        try {
            setExpansion(await expandEvidence(evidence.evidence_ref_id, answerId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Evidence detail is unavailable.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2 border-l-2 border-(--border) pl-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium text-(--text-primary)">
                        {evidence.display_label}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                        {evidence.provenance} · {formatTimestamp(evidence.observed_at)}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => void openExpansion()}
                    disabled={loading}
                    className="rounded-(--radius-sm) px-2 py-1 text-xs font-medium text-(--accent) hover:bg-(--accent)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                >
                    {loading ? "Opening…" : CTA_LABELS.openEvidence}
                </button>
            </div>
            {evidence.citation_text ? (
                <p className="text-sm leading-6 text-(--text-secondary)">
                    {evidence.citation_text}
                </p>
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
    const { selectProposedEntity, submitAnswerFeedback, submitQuestion } = useAskDev();
    const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | "saving" | null>(null);
    const [feedbackError, setFeedbackError] = useState<string | null>(null);
    const scopeResolution = answer.resolved_scope;

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
        <article className="space-y-5" aria-label="Ask Dev answer">
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-(--radius-pill) bg-(--accent-ai)/12 px-2.5 py-1 text-label-caps text-(--accent-ai)">
                    AI-generated
                </span>
                <span className="rounded-(--radius-pill) border border-(--border) px-2.5 py-1 text-label-caps text-(--text-muted)">
                    {answer.status.replaceAll("_", " ")}
                </span>
                <span className="text-xs text-(--text-muted)">
                    As of {formatTimestamp(answer.as_of)}
                </span>
            </div>

            <p className="text-body leading-7 text-(--text-primary)">{answer.direct_summary}</p>

            {scopeResolution ? (
                <section
                    className="border-y border-(--border) py-3"
                    aria-label="Resolved answer scope"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-(--text-muted)">
                            Scope outcome:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {scopeResolution.outcome.replaceAll("_", " ")}
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
                    aria-labelledby="ask-dev-findings"
                >
                    <h3 id="ask-dev-findings" className="text-label-caps text-(--text-muted)">
                        What the evidence suggests
                    </h3>
                    <ul className="space-y-3">
                        {answer.claims.map((claim) => (
                            <li key={claim.claim_id} className="flex gap-3 text-sm leading-6">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
                                <span>
                                    {claim.text}
                                    <span className="ml-2 text-xs text-(--text-muted)">
                                        {claim.kind.replaceAll("_", " ")} ·{" "}
                                        {formatPercent(claim.confidence * 100)} confidence
                                    </span>
                                </span>
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
                    aria-labelledby="ask-dev-metrics"
                >
                    <h3 id="ask-dev-metrics" className="text-label-caps text-(--text-muted)">
                        Metrics
                    </h3>
                    <dl className="mt-2 divide-y divide-(--border)">
                        {answer.metrics.map((metric) => (
                            <div
                                key={metric.metric_ref_id}
                                className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
                            >
                                <dt className="text-sm text-(--text-secondary)">
                                    {metric.label}
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
                                    <details className="mt-1 text-xs text-(--text-muted)">
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
                    aria-labelledby="ask-dev-evidence"
                >
                    <h3 id="ask-dev-evidence" className="text-label-caps text-(--text-muted)">
                        Evidence
                    </h3>
                    <div className="space-y-4">
                        {answer.evidence.map((evidence) => (
                            <EvidenceRow
                                key={evidence.evidence_ref_id}
                                evidence={evidence}
                                answerId={answer.answer_id}
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
