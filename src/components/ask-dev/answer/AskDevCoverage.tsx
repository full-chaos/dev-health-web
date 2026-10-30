import { useId, type ReactNode } from "react";

import {
    COMPLETENESS_READING,
    COMPLETENESS_TEXT,
    COVERAGE_COPY,
    completenessOf,
    evidenceClosure,
    evidenceGroups,
    factCountText,
    limitingDetails,
    requirementLines,
    sourceLines,
    type CoverageResult,
    type EvidenceGroup,
    type Reading,
} from "./coverageModel";
import { SafeAnswerText } from "./SafeAnswerText";

/** One mark per reading, so the kinds of "not fully known" differ by more than colour. */
const READING_MARK: Record<Reading, string> = {
    full: "●",
    sparse: "◐",
    stale: "◷",
    unknown: "?",
    zero: "0",
    not_applicable: "–",
};

function Mark({ reading }: { reading: Reading }) {
    return (
        <span
            aria-hidden="true"
            className="inline-block w-4 shrink-0 text-center text-(--ink-muted)"
        >
            {READING_MARK[reading]}
        </span>
    );
}

function Block({
    title,
    testId,
    children,
}: {
    title: string;
    testId: string;
    children: ReactNode;
}) {
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} data-testid={testId} className="space-y-1.5">
            <h4 id={titleId} className="text-xs font-semibold text-(--ink-muted)">
                {title}
            </h4>
            {children}
        </section>
    );
}

/**
 * Evidence groups as plain text, never as links: opening a reference is not wired yet, so nothing
 * here is focusable, underlined or styled as a link.
 */
function EvidenceList({ groups, testId }: { groups: readonly EvidenceGroup[]; testId: string }) {
    return (
        <ul className="flex flex-wrap gap-1.5" data-testid={testId}>
            {groups.map((group) => (
                <li
                    key={group.kind}
                    data-kind={group.kind}
                    className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs text-foreground"
                >
                    {group.text}
                </li>
            ))}
        </ul>
    );
}

/**
 * How complete one answer is (CHAOS-11932, North Star checks 4, 5, 11 and 12): the completeness
 * the service derived, each requirement's outcome, each source and its state, what limited the
 * answer, the limitations and warnings it named, and its evidence references. The answer is shown
 * with its limits, never withheld for them. Unknown, stale, sparse, not applicable and zero each
 * carry their own words and mark.
 */
export function AskDevCoverage({ result }: { result: CoverageResult }) {
    const titleId = useId();
    const completeness = completenessOf(result);
    const state = completeness?.state ?? "absent";
    const requirements = completeness === null ? [] : requirementLines(completeness);
    const sources = sourceLines(result);
    const details = limitingDetails(result);
    const cited = evidenceGroups(result.evidence_ref_ids);
    const closure = evidenceClosure(result);
    const all = evidenceGroups(closure);
    const limitations = result.limitations ?? [];
    const warnings = result.warnings ?? [];

    return (
        <section
            aria-labelledby={titleId}
            className="space-y-3 rounded-(--radius-sm) border border-(--card-stroke) p-3"
            data-testid="ask-dev-coverage"
        >
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
                {COVERAGE_COPY.title}
            </h3>

            <div className="space-y-1" data-testid="ask-dev-coverage-completeness">
                <p
                    className="flex gap-1.5 text-sm text-foreground"
                    data-reading={COMPLETENESS_READING[state]}
                    data-testid="ask-dev-coverage-state"
                >
                    <Mark reading={COMPLETENESS_READING[state]} />
                    <span>{COMPLETENESS_TEXT[state]}</span>
                </p>
                {completeness === null ? null : (
                    <p
                        className="pl-5.5 text-xs text-(--ink-muted)"
                        data-testid="ask-dev-coverage-counts"
                        data-reading={completeness.claimed_facts_count === 0 ? "zero" : undefined}
                    >
                        {factCountText(completeness)}
                    </p>
                )}
            </div>

            {requirements.length === 0 ? null : (
                <Block
                    title={COVERAGE_COPY.requirementsTitle}
                    testId="ask-dev-coverage-requirements"
                >
                    <ul className="space-y-1 text-sm">
                        {requirements.map((line) => (
                            <li key={line.key} className="flex gap-1.5" data-reading={line.reading}>
                                <Mark reading={line.reading} />
                                <span>
                                    <span className="text-foreground">{line.label}</span>
                                    <span className="text-(--ink-muted)">: {line.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Block>
            )}

            <Block title={COVERAGE_COPY.sourcesTitle} testId="ask-dev-coverage-sources">
                {sources.length === 0 ? (
                    <p className="flex gap-1.5 text-sm text-(--ink-muted)" data-reading="unknown">
                        <Mark reading="unknown" />
                        <span>{COVERAGE_COPY.sourcesEmpty}</span>
                    </p>
                ) : (
                    <ul className="space-y-1 text-sm">
                        {sources.map((line) => (
                            <li key={line.key} className="flex gap-1.5" data-reading={line.reading}>
                                <Mark reading={line.reading} />
                                <span>
                                    <span className="text-foreground">
                                        <SafeAnswerText text={line.label} />
                                    </span>
                                    <span className="text-(--ink-muted)">
                                        : {line.text}
                                        {line.observedAt === null
                                            ? null
                                            : ` (${COVERAGE_COPY.staleSince} ${line.observedAt})`}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Block>

            {details.length === 0 ? null : (
                <Block title={COVERAGE_COPY.limitsTitle} testId="ask-dev-coverage-details">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {details.map((detail) => (
                            <li key={detail.detail_id} data-degrading={detail.degrading}>
                                <SafeAnswerText text={detail.label} />
                            </li>
                        ))}
                    </ul>
                </Block>
            )}

            <Block title={COVERAGE_COPY.limitationsTitle} testId="ask-dev-coverage-limitations">
                {limitations.length === 0 ? (
                    <p className="text-sm text-(--ink-muted)">{COVERAGE_COPY.noLimitations}</p>
                ) : (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {limitations.map((text, index) => (
                            <li key={index}>
                                <SafeAnswerText text={text} />
                            </li>
                        ))}
                    </ul>
                )}
            </Block>

            {warnings.length === 0 ? null : (
                <Block title={COVERAGE_COPY.warningsTitle} testId="ask-dev-coverage-warnings">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                        {warnings.map((text, index) => (
                            <li key={index}>
                                <SafeAnswerText text={text} />
                            </li>
                        ))}
                    </ul>
                </Block>
            )}

            <Block title={COVERAGE_COPY.evidenceTitle} testId="ask-dev-coverage-evidence">
                {closure.length === 0 ? (
                    <p className="text-sm text-(--ink-muted)">{COVERAGE_COPY.evidenceNone}</p>
                ) : (
                    <div className="space-y-2">
                        {cited.length === 0 ? null : (
                            <div className="space-y-1">
                                <p className="text-xs text-(--ink-muted)">
                                    {COVERAGE_COPY.evidenceCited}
                                </p>
                                <EvidenceList
                                    groups={cited}
                                    testId="ask-dev-coverage-evidence-cited"
                                />
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className="text-xs text-(--ink-muted)">
                                {COVERAGE_COPY.evidenceAll}
                            </p>
                            <EvidenceList groups={all} testId="ask-dev-coverage-evidence-all" />
                        </div>
                        <p
                            className="text-xs text-(--ink-muted)"
                            data-testid="ask-dev-coverage-evidence-note"
                        >
                            {COVERAGE_COPY.evidenceNotOpenable}
                        </p>
                    </div>
                )}
            </Block>
        </section>
    );
}
