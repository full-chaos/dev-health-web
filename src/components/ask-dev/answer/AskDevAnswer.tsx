import { useId, type ReactNode } from "react";

import { formatPercent } from "@/lib/formatters";

import {
    ANSWER_COPY,
    DERIVATION_LABEL,
    EPISTEMIC_LABEL,
    FACT_KIND_LABEL,
    SOURCE_STATE_LABEL,
    STANDING_LABEL,
    evidenceCountText,
    isModelWritten,
    labelFor,
    leadSentence,
    serviceSummary,
    type AnswerDriver,
    type AnswerFinding,
    type AnswerResult,
} from "./answerModel";
import { AskDevCoverage } from "./AskDevCoverage";
import { quickStatus } from "./quickStatus";
import { SafeAnswerText } from "./SafeAnswerText";
import { nonBlank } from "@/lib/ask-dev/conversation";

const PILL =
    "inline-flex items-center rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs font-medium";

function SubjectLine({ subjects }: { subjects: readonly { label: string }[] | undefined }) {
    if (!subjects || subjects.length === 0) return null;
    return (
        <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-answer-subjects">
            {ANSWER_COPY.about}: {subjects.map((subject) => subject.label).join(", ")}
        </p>
    );
}

/**
 * One driver (check 8: never bare). The title always comes with its explanation, the fact kind,
 * how sure the source is, where it comes from, its confidence, what it is about and how much
 * evidence backs it. A driver whose explanation is blank says so instead of standing alone.
 */
function DriverItem({ driver }: { driver: AnswerDriver }) {
    const summary = nonBlank(driver.summary);
    const qualification = nonBlank(driver.qualification);
    const sourceState =
        driver.source_state && driver.source_state !== "available"
            ? labelFor(SOURCE_STATE_LABEL, driver.source_state)
            : null;
    const confidence = Number.isFinite(driver.confidence)
        ? formatPercent(driver.confidence * 100)
        : null;
    return (
        <li
            className="rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) p-3"
            data-testid="ask-dev-answer-driver"
            data-standing={driver.standing}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-foreground">
                    <SafeAnswerText text={driver.title} />
                </p>
                <span className={`${PILL} shrink-0 text-(--ink-muted)`}>
                    {labelFor(STANDING_LABEL, driver.standing)}
                </span>
            </div>
            <p className="mt-1 text-sm text-foreground" data-testid="ask-dev-answer-driver-summary">
                {summary === undefined ? (
                    <span className="text-(--ink-muted)">{ANSWER_COPY.driverNoExplanation}</span>
                ) : (
                    <SafeAnswerText text={summary} />
                )}
            </p>
            {qualification === undefined ? null : (
                <p className="mt-1 text-xs text-(--ink-muted)">
                    <SafeAnswerText text={qualification} />
                </p>
            )}
            <p
                className="mt-2 text-xs text-(--ink-muted)"
                data-testid="ask-dev-answer-driver-basis"
            >
                {labelFor(FACT_KIND_LABEL, driver.category)} ·{" "}
                {labelFor(EPISTEMIC_LABEL, driver.epistemic_status)} ·{" "}
                {labelFor(DERIVATION_LABEL, driver.derivation)}
                {confidence === null ? null : ` · ${ANSWER_COPY.confidence} ${confidence}`}
                {sourceState === null ? null : ` · ${sourceState}`}
            </p>
            <SubjectLine subjects={driver.affected_subjects} />
            <p className="text-xs text-(--ink-muted)">
                {evidenceCountText(driver.evidence_ref_ids.length)}
            </p>
        </li>
    );
}

function FindingItem({ finding }: { finding: AnswerFinding }) {
    return (
        <li
            className="rounded-(--radius-sm) border border-(--card-stroke) p-3"
            data-testid="ask-dev-answer-finding"
            data-kind={finding.kind}
        >
            <p className="text-xs font-semibold text-(--ink-muted)">
                {labelFor(FACT_KIND_LABEL, finding.kind)}
            </p>
            <p className="mt-1 text-sm text-foreground">
                <SafeAnswerText text={finding.summary} />
            </p>
            <SubjectLine subjects={finding.subjects} />
            <p className="text-xs text-(--ink-muted)">
                {evidenceCountText(finding.evidence_ref_ids.length)}
            </p>
        </li>
    );
}

/**
 * One part of an answer: a labelled group, not a landmark. A transcript holds many answers, and a
 * named `section` per part made their landmarks repeat (CHAOS-12157, axe `landmark-unique`).
 */
function Part({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
    const titleId = useId();
    return (
        <div role="group" aria-labelledby={titleId} data-testid={testId} className="space-y-2">
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
                {title}
            </h3>
            {children}
        </div>
    );
}

function FindingsPart({
    title,
    empty,
    findings,
    testId,
}: {
    title: string;
    empty: string;
    findings: readonly AnswerFinding[];
    testId: string;
}) {
    return (
        <Part title={title} testId={testId}>
            {findings.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">{empty}</p>
            ) : (
                <ul className="space-y-2">
                    {findings.map((finding) => (
                        <FindingItem key={finding.finding_id} finding={finding} />
                    ))}
                </ul>
            )}
        </Part>
    );
}

/**
 * The direct answer of one investigation result (CHAOS-11930): the quick answer first, the
 * details after. The quick answer is the judgment sentence with the answer's own status (check 3:
 * the state of the answer, never of the work; CHAOS-12157: "Full answer" only when its
 * completeness is complete too, and a status ACR corrected is said to be corrected) and, when a model wrote the analysis, an AI label.
 * Then the drivers (check 8), the strongest pressures, and the findings in three separate parts
 * (remaining work, readiness gaps, conflicts: completion and readiness are never merged). The
 * current state and a differing service sentence sit behind "More detail". Every served string is
 * inert text through `SafeAnswerText`. After the findings, how complete the answer is: coverage,
 * completeness, limitations and evidence references (CHAOS-11932, `AskDevCoverage`).
 */
export function AskDevAnswer({ result }: { result: AnswerResult }) {
    const lead = leadSentence(result);
    const summary = serviceSummary(result);
    const currentState = nonBlank(result.current_state);
    const modelWritten = isModelWritten(result);
    const status = quickStatus(result);
    const hasAnalysis =
        result.drivers.length > 0 ||
        result.strongest_pressures.length > 0 ||
        result.remaining_work.length > 0 ||
        result.readiness_gaps.length > 0 ||
        result.conflicts.length > 0 ||
        currentState !== undefined;
    const answered = result.status !== "clarification_required" && result.status !== "no_match";

    return (
        <article className="space-y-5" data-testid="ask-dev-answer" data-status={result.status}>
            <div className="space-y-2" data-testid="ask-dev-answer-quick">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={`${PILL} text-foreground`}
                        data-testid="ask-dev-answer-status"
                        data-coverage={status.coverage ?? undefined}
                    >
                        {status.label}
                    </span>
                    {modelWritten ? (
                        <span
                            className={`${PILL} border-(--accent-2)/40 text-(--accent-2)`}
                            data-testid="ask-dev-answer-ai-label"
                        >
                            {ANSWER_COPY.aiLabel}
                        </span>
                    ) : null}
                </div>
                <p
                    className="text-base font-semibold text-foreground"
                    data-testid="ask-dev-answer-lead"
                >
                    {lead === null ? (
                        <span className="text-(--ink-muted)">{ANSWER_COPY.noLead}</span>
                    ) : (
                        <SafeAnswerText text={lead} />
                    )}
                </p>
                {status.completenessNote === null ? null : (
                    <p
                        className="text-sm text-foreground"
                        data-testid="ask-dev-answer-completeness"
                    >
                        {status.completenessNote}
                    </p>
                )}
                {status.correctionNote === null ? null : (
                    <p
                        className="text-xs text-(--ink-muted)"
                        data-testid="ask-dev-answer-correction"
                    >
                        {status.correctionNote}
                    </p>
                )}
                {modelWritten ? (
                    <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-answer-ai-note">
                        {ANSWER_COPY.aiNote}
                    </p>
                ) : null}
            </div>

            {answered || hasAnalysis ? (
                <>
                    <Part title={ANSWER_COPY.driversTitle} testId="ask-dev-answer-drivers">
                        {result.drivers.length === 0 ? (
                            <p className="text-sm text-(--ink-muted)">{ANSWER_COPY.driversEmpty}</p>
                        ) : (
                            <>
                                <p className="text-xs text-(--ink-muted)">
                                    {ANSWER_COPY.driversIntro}
                                </p>
                                <ul className="space-y-2">
                                    {result.drivers.map((driver) => (
                                        <DriverItem key={driver.driver_id} driver={driver} />
                                    ))}
                                </ul>
                            </>
                        )}
                    </Part>

                    {result.strongest_pressures.length === 0 ? null : (
                        <Part title={ANSWER_COPY.pressuresTitle} testId="ask-dev-answer-pressures">
                            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                                {result.strongest_pressures.map((pressure, index) => (
                                    <li key={index}>
                                        <SafeAnswerText text={pressure} />
                                    </li>
                                ))}
                            </ul>
                        </Part>
                    )}

                    <FindingsPart
                        title={ANSWER_COPY.remainingWorkTitle}
                        empty={ANSWER_COPY.remainingWorkEmpty}
                        findings={result.remaining_work}
                        testId="ask-dev-answer-remaining-work"
                    />
                    <FindingsPart
                        title={ANSWER_COPY.readinessGapsTitle}
                        empty={ANSWER_COPY.readinessGapsEmpty}
                        findings={result.readiness_gaps}
                        testId="ask-dev-answer-readiness-gaps"
                    />
                    <FindingsPart
                        title={ANSWER_COPY.conflictsTitle}
                        empty={ANSWER_COPY.conflictsEmpty}
                        findings={result.conflicts}
                        testId="ask-dev-answer-conflicts"
                    />

                    <AskDevCoverage result={result} />
                </>
            ) : null}

            {currentState === undefined && summary === null ? null : (
                <details
                    className="rounded-(--radius-sm) border border-(--card-stroke) p-3"
                    data-testid="ask-dev-answer-more"
                >
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                        {ANSWER_COPY.moreDetail}
                    </summary>
                    {currentState === undefined ? null : (
                        <div className="mt-2 space-y-1">
                            <h4 className="text-xs font-semibold text-(--ink-muted)">
                                {ANSWER_COPY.currentStateTitle}
                            </h4>
                            <p className="text-sm text-foreground">
                                <SafeAnswerText text={currentState} />
                            </p>
                        </div>
                    )}
                    {summary === null ? null : (
                        <div className="mt-2 space-y-1">
                            <h4 className="text-xs font-semibold text-(--ink-muted)">
                                {ANSWER_COPY.serviceSummaryTitle}
                            </h4>
                            <p className="text-sm text-foreground">
                                <SafeAnswerText text={summary} />
                            </p>
                        </div>
                    )}
                </details>
            )}
        </article>
    );
}
