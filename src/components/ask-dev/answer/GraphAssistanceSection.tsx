"use client";

import type { DevAnswer } from "@/lib/dev/generated";
import { WITHHELD_COPY } from "@/lib/dev/internalTokens";
import { formatNumber, formatPercent, formatTimestamp } from "@/lib/formatters";

import { InlineCitations, type CitationTargets } from "./InlineCitations";
import type { SafeProse } from "./labels";

type GraphAssistance = NonNullable<DevAnswer["graph_assisted"]>;
type GraphState = GraphAssistance["state"];
type GraphCohort = NonNullable<GraphAssistance["cohort"]>;
type CohortEntityKind = GraphCohort["entity_kind"];
type CohortInclusionBasis = GraphCohort["members"][number]["inclusion_basis"];
type GraphLimitation = NonNullable<GraphAssistance["limitations"]>[number];

/**
 * Customer-safe source-health labels for the graph contribution.
 *
 * These records are deliberately total over the pinned wire unions. A new
 * backend state must get an explicit product label before it can reach the
 * answer, rather than silently rendering its machine value.
 */
export const GRAPH_STATE_LABELS: Record<GraphState, string> = {
    enabled: "Available",
    unavailable: "Not available",
    stale: "Needs review",
    lagging: "Catching up",
    truncated: "Partial context",
    fallback: "Available evidence only",
};

export const GRAPH_STATE_EXPLANATIONS: Record<GraphState, string> = {
    enabled: "Additional evidence context is ready for this answer.",
    unavailable:
        "Additional context could not be read, so this answer uses the evidence currently available.",
    stale: "Additional context may be out of date; review the dates shown with the evidence.",
    lagging:
        "Additional context is still catching up, so this answer uses the evidence currently available.",
    truncated:
        "Only part of the related context was available. The answer includes the resulting limits below.",
    fallback:
        "Additional context could not be used, so this answer uses the evidence currently available.",
};

export const COHORT_ENTITY_LABELS: Record<CohortEntityKind, string> = {
    repository: "Repository",
    project: "Project",
    work_unit: "Work item",
    issue: "Issue",
    pull_request: "Pull request",
    team: "Team",
};

export const COHORT_INCLUSION_LABELS: Record<CohortInclusionBasis, string> = {
    team_pressure: "Included based on the team's current pressure signal.",
    project_capacity: "Included based on the project's current capacity signal.",
};

export const GRAPH_LIMITATION_LABELS: Record<GraphLimitation, string> = {
    missing_source: "A required source was unavailable.",
    stale_source: "Some supporting data may be out of date.",
    conflicting_evidence: "The available sources did not fully agree.",
    authorization_filtered: "Some related records were not included.",
    truncated_traversal: "The evidence path is partial.",
    absent_staffing_denominator: "Staffing context was not available.",
    historical_slice_not_comparable: "The historical comparison is not directly comparable.",
    interpretation_uncertainty: "This result needs interpretation alongside the evidence.",
};

const GRAPH_ATTESTABLE_INTERNAL_TERMS = ["Graphiti", "Cypher"] as const;
const GRAPH_NEVER_ATTESTABLE_TERMS = [
    "graph_assisted",
    "resolved_scope",
    "canonical_enrichment",
    ...Object.keys(COHORT_ENTITY_LABELS).filter((value) => value.includes("_")),
    ...Object.keys(COHORT_INCLUSION_LABELS),
    ...Object.keys(GRAPH_LIMITATION_LABELS),
] as const;
const GRAPH_NEVER_ATTESTABLE_TERM_SET = new Set(
    GRAPH_NEVER_ATTESTABLE_TERMS.map((term) => term.toLowerCase()),
);
const GRAPH_INTERNAL_TERMS = new RegExp(
    `\\b(?:${[...GRAPH_ATTESTABLE_INTERNAL_TERMS, ...GRAPH_NEVER_ATTESTABLE_TERMS].join("|")})\\b`,
    "giu",
);

/**
 * The shared graph contribution rendered in both the compact window and the
 * full Ask Dev workspace through AskDevAnswer.
 *
 * The wire object is a contribution to an answer, not a second answer. This
 * component therefore only presents the server-owned state, cohort context,
 * driver evidence, lineage, and declared limits. Evidence references use the
 * same targets as claims and metrics, so a citation opens and focuses the
 * existing evidence lane rather than creating a second detail path.
 */
export function GraphAssistanceSection({
    graphAssistance,
    headingId,
    safeProse,
    targets,
}: {
    graphAssistance: GraphAssistance;
    headingId: string;
    safeProse: SafeProse;
    targets: CitationTargets;
}) {
    const {
        cohort,
        evidence_lineage: evidenceLineage,
        limitations,
        ranked_drivers: rankedDrivers,
    } = graphAssistance;
    const stateLabel = GRAPH_STATE_LABELS[graphAssistance.state];
    const stateExplanation = GRAPH_STATE_EXPLANATIONS[graphAssistance.state];
    const graphAttested = (cohort?.members ?? [])
        .map((member) => member.display_label)
        .join(" ")
        .toLowerCase();
    const safeGraphProse: SafeProse = (value) => {
        const safeValue = safeProse(value);
        for (const match of safeValue.matchAll(GRAPH_INTERNAL_TERMS)) {
            const term = match[0].toLowerCase();
            if (GRAPH_NEVER_ATTESTABLE_TERM_SET.has(term) || !graphAttested.includes(term)) {
                return WITHHELD_COPY;
            }
        }
        return safeValue;
    };

    return (
        <section className="space-y-4 border-t border-(--border) pt-4" aria-labelledby={headingId}>
            <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={headingId} className="text-label-caps text-(--text-muted)">
                        Additional evidence context
                    </h3>
                    <span className="rounded-(--radius-pill) border border-(--border) px-2 py-1 text-label-caps text-(--text-secondary)">
                        {stateLabel}
                    </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--text-muted)">
                    <span>
                        Source health: <strong className="font-medium">{stateLabel}</strong>
                    </span>
                    <span>Updated {formatTimestamp(graphAssistance.as_of)}</span>
                </div>
                <p className="text-sm leading-6 text-(--text-secondary)">{stateExplanation}</p>
            </div>

            {cohort ? (
                <section className="space-y-2" aria-label="Included context">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-h3 text-(--text-primary)">Included context</h4>
                        <span className="text-xs text-(--text-muted)">
                            {COHORT_ENTITY_LABELS[cohort.entity_kind]} ·{" "}
                            {formatNumber(cohort.members.length, { maximumFractionDigits: 0 })}{" "}
                            included
                        </span>
                    </div>
                    {!cohort.cohort_complete ? (
                        <p className="text-xs text-(--caution)">
                            This list is partial; some related context may not be included.
                        </p>
                    ) : null}
                    <ul className="divide-y divide-(--border) rounded-(--radius-md) border border-(--border)">
                        {cohort.members.map((member) => (
                            <li
                                key={member.entity_id + ":" + member.inclusion_basis}
                                className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
                            >
                                <span className="text-sm text-(--text-secondary)">
                                    {safeGraphProse(member.display_label)}
                                </span>
                                <span className="text-xs leading-5 text-(--text-muted)">
                                    {COHORT_INCLUSION_LABELS[member.inclusion_basis]}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {cohort.warnings?.length ? (
                        <ul
                            className="space-y-1 text-xs text-(--caution)"
                            aria-label="Context notes"
                        >
                            {cohort.warnings.map((warning) => (
                                <li key={warning}>{safeGraphProse(warning)}</li>
                            ))}
                        </ul>
                    ) : null}
                </section>
            ) : null}

            {rankedDrivers?.length ? (
                <section className="space-y-2" aria-label="Ranked drivers">
                    <h4 className="text-h3 text-(--text-primary)">Ranked drivers</h4>
                    <ol className="divide-y divide-(--border) rounded-(--radius-md) border border-(--border)">
                        {rankedDrivers.map((driver) => (
                            <li
                                key={driver.rank + ":" + driver.evidence_ref_ids.join(",")}
                                className="grid gap-2 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-3"
                            >
                                <span
                                    aria-label={"Rank " + driver.rank}
                                    className="flex h-6 min-w-6 items-center justify-center rounded-(--radius-pill) bg-(--accent-ai)/12 px-1.5 text-xs font-medium text-(--accent-ai)"
                                >
                                    {driver.rank}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm text-(--text-secondary)">
                                        Driver {driver.rank}
                                        <InlineCitations
                                            evidenceRefIds={driver.evidence_ref_ids}
                                            ownerLabel={"driver " + driver.rank}
                                            targets={targets}
                                        />
                                    </p>
                                    <p className="mt-1 text-xs text-(--text-muted)">
                                        Supporting evidence for this driver is shown below.
                                    </p>
                                </div>
                                <span className="text-xs text-(--text-muted) sm:text-right">
                                    {formatPercent(driver.contribution * 100)} contribution
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            {evidenceLineage?.length ? (
                <section className="space-y-2" aria-label="Evidence lineage">
                    <h4 className="text-h3 text-(--text-primary)">Evidence lineage</h4>
                    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-(--text-secondary)">
                        {evidenceLineage.map((hop, index) => (
                            <li
                                key={hop.label + ":" + index}
                                className="inline-flex items-center gap-2"
                            >
                                <span>{safeGraphProse(hop.label)}</span>
                                {index < evidenceLineage.length - 1 ? (
                                    <span aria-hidden="true" className="text-(--text-muted)">
                                        →
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            {limitations?.length ? (
                <section
                    className="rounded-(--radius-md) border border-(--caution)/30 bg-(--caution)/8 p-3"
                    aria-label="Context limitations"
                >
                    <p className="text-label-caps text-(--caution)">Context limitations</p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-(--text-secondary)">
                        {limitations.map((limitation) => (
                            <li key={limitation}>{GRAPH_LIMITATION_LABELS[limitation]}</li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </section>
    );
}
