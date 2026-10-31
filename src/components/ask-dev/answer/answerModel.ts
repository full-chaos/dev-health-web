import type {
    ACRContextFabricInvestigationResponseV1,
    ACRContextFabricInvestigationResponseV2,
    ACRContextFabricInvestigationResultV1,
} from "@/lib/acr/generated";
import { nonBlank } from "@/lib/ask-dev/conversation";

/**
 * The fields of one investigation result that the direct answer reads (CHAOS-11930). Every ACR
 * answer shape (result v1, response v1 and v2) carries them, so the components take any of them.
 */
type AnswerFields =
    | "status"
    | "deterministic_answer"
    | "direct_judgment"
    | "current_state"
    | "strongest_pressures"
    | "drivers"
    | "remaining_work"
    | "readiness_gaps"
    | "conflicts"
    | "versions"
    // CHAOS-11932: coverage, completeness, limitations and evidence references.
    | "completeness"
    | "coverage"
    | "limitations"
    | "warnings"
    | "evidence_ref_ids"
    | "evidence_ref_labels"
    // CHAOS-12157: the status ACR replaced, when its completeness authority corrected it.
    | "status_correction"
    // CHAOS-11944: the cohort ranking (cohort, the question's shape, ACR's cohort-rule render shapes)
    // and the answer window in its header.
    | "cohort"
    | "interpretation"
    | "render_shapes"
    | "effective_evidence_window"
    // CHAOS-11945: the claimed-fact tables (their window is effective_evidence_window above).
    | "claimed_facts"
    // CHAOS-11942: the ids a withheld chart is logged with.
    | "result_id"
    | "request_id";

export type AnswerResult =
    | Pick<ACRContextFabricInvestigationResultV1, AnswerFields>
    | Pick<ACRContextFabricInvestigationResponseV1, AnswerFields>
    | Pick<ACRContextFabricInvestigationResponseV2, AnswerFields>;

export type AnswerStatus = AnswerResult["status"];
export type AnswerDriver = AnswerResult["drivers"][number];
export type AnswerFinding = AnswerResult["remaining_work"][number];

/**
 * True when a model wrote the analysis of this answer. ACR names the synthesis in
 * `versions.synthesis_version`; `not_synthesized` is its one value for an answer no model wrote
 * (a clarification, a no-match, a client-written answer it did not take). Anything else, or a
 * missing value, is read as model-written: a label too many is safer than one too few.
 */
export function isModelWritten(result: AnswerResult): boolean {
    return result.versions?.synthesis_version !== "not_synthesized";
}

/**
 * The quick answer: the judgment sentence, or the service's answer sentence when it sent no
 * judgment (a clarification, a no-match). `null` when both are blank.
 */
export function leadSentence(result: AnswerResult): string | null {
    return nonBlank(result.direct_judgment) ?? nonBlank(result.deterministic_answer) ?? null;
}

/**
 * The service's answer sentence, when it is not the lead and says something else. It is shown
 * after the details, never in place of the judgment.
 */
export function serviceSummary(result: AnswerResult): string | null {
    const lead = leadSentence(result);
    const summary = nonBlank(result.deterministic_answer);
    if (summary === undefined || summary.trim() === lead?.trim()) return null;
    return summary;
}

/**
 * Check 3 (status ≠ completion ≠ readiness): the result's own status is the state of the ANSWER,
 * never of the work. Each label says "answer" so it cannot be read as a project status or as
 * work completion.
 */
export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
    complete: "Full answer",
    partial: "Partial answer",
    degraded: "Degraded answer",
    clarification_required: "Answer needs your confirmation",
    no_match: "No answer: no matching subject",
};

/**
 * Fact kinds (driver `category`, finding `kind`; open vocabulary). Status, completion, readiness
 * and health each keep a label of their own (check 3): one is never shown as another.
 */
export const FACT_KIND_LABEL: Record<string, string> = {
    status: "Status",
    actual_completion: "Completion",
    work: "Work",
    blockers: "Blockers",
    reviews: "Reviews",
    continuous_integration: "Continuous integration",
    deployments: "Deployments",
    incidents: "Incidents",
    health: "Health",
    workload: "Workload",
    investment: "Investment",
    readiness: "Readiness",
    operational_deficiency: "Operational deficiency",
    source_health: "Source health",
    relationship: "Relationship",
    narrative: "Narrative",
};

export const STANDING_LABEL: Record<string, string> = {
    principal: "Principal",
    contributing: "Contributing",
    symptom: "Symptom",
    context: "Context",
    withheld: "Withheld",
};

/** Where a driver comes from, in plain words. */
export const DERIVATION_LABEL: Record<string, string> = {
    canonical_structured: "from structured source data",
    deterministic_projection: "computed from source data",
    graph_associated: "linked through the work graph",
    model_extracted: "extracted by AI",
    rule_inferred: "inferred by a rule",
};

/** How sure the source is of a driver. */
export const EPISTEMIC_LABEL: Record<string, string> = {
    observed: "observed",
    source_asserted: "stated by the source",
    inferred: "inferred",
    disputed: "disputed",
    superseded: "superseded",
    unknown: "not known",
};

/** The state of the source behind a driver, when it is not simply available. */
export const SOURCE_STATE_LABEL: Record<string, string> = {
    stale: "the source data is stale",
    unavailable: "the source was unavailable",
    unconfigured: "the source is not set up",
    unauthorized: "the source was not readable with your access",
    no_data: "the source had no data",
    truncated: "the source read was cut short",
    conflicted: "the sources disagree",
    not_applicable: "the source does not apply",
    pruned: "part of the source was left out",
};

/** A value the vocabulary does not know yet, in readable words (open vocabularies). */
export function humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim();
    return words === "" ? value : words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelFor(table: Record<string, string>, value: string): string {
    return Object.hasOwn(table, value) ? (table[value] as string) : humanize(value);
}

/**
 * The words this view writes around the service's text. AI output is labelled, and the view's own
 * wording about it says "appears", "leans" or "suggests", never "is", "was", "detected" or
 * "determined" (AGENTS.md; `answerModel.test.ts` holds it).
 */
export const ANSWER_COPY = {
    aiLabel: "AI-written",
    aiNote: "A model wrote this analysis from the facts read for this question. It suggests why; check the evidence before you act on it.",
    driversTitle: "Drivers",
    driversIntro: "What appears to drive this answer.",
    driversEmpty: "No drivers reported.",
    driverNoExplanation: "No explanation sent for this driver.",
    pressuresTitle: "Strongest pressures",
    remainingWorkTitle: "Remaining work",
    remainingWorkEmpty: "No remaining work reported.",
    readinessGapsTitle: "Readiness gaps",
    readinessGapsEmpty: "No readiness gaps reported.",
    conflictsTitle: "Conflicts",
    conflictsEmpty: "No conflicts reported.",
    moreDetail: "More detail",
    currentStateTitle: "Current state",
    serviceSummaryTitle: "Service summary",
    noLead: "The service sent no answer sentence.",
    about: "About",
    confidence: "confidence",
    // CHAOS-11945: the claimed-fact tables.
    factTablesTitle: "Fact tables",
    factTablesIntro: "The rows the service read for this answer, as it sent them.",
    factTablesWindow: "Window",
    factAlsoCited: "Also cited for",
    factMeasureSuffix: "(measure)",
    factCellAbsent: "not in this row",
    factCellNull: "no value",
} as const;

export function evidenceCountText(count: number): string {
    return count === 1 ? "1 evidence reference" : `${count} evidence references`;
}
