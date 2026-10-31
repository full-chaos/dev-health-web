import type {
    ACRContextFabricInvestigationResponseV1,
    ACRContextFabricInvestigationResponseV2,
    ACRContextFabricInvestigationResultV1,
} from "@/lib/acr/generated";
import { nonBlank } from "@/lib/ask-dev/conversation";

import { humanize, labelFor } from "./answerModel";

/**
 * Coverage, completeness, limitations and evidence references of one answer (CHAOS-11932). North
 * Star check 11: these are public contract fields, shown beside the prose. Check 12: missing is not
 * healthy. Unknown, stale, sparse, not applicable and zero each read in words of their own, and
 * none of them reads as complete.
 */
type CoverageFields =
    | "completeness"
    | "coverage"
    | "limitations"
    | "warnings"
    | "evidence_ref_ids"
    | "evidence_ref_labels";

export type CoverageResult =
    | Pick<ACRContextFabricInvestigationResultV1, CoverageFields>
    | Pick<ACRContextFabricInvestigationResponseV1, CoverageFields>
    | Pick<ACRContextFabricInvestigationResponseV2, CoverageFields>;

type Completeness = ACRContextFabricInvestigationResultV1["completeness"];
type OutcomeRow = NonNullable<Completeness["outcomes"]>[number];
export type SourceObservation =
    ACRContextFabricInvestigationResultV1["coverage"]["sources"][number];
export type CoverageDetail = NonNullable<
    ACRContextFabricInvestigationResultV1["coverage"]["details"]
>[number];

/**
 * The five kinds of "not fully known" this view tells apart (check 12), plus the two that are
 * known: read in full, and does not apply is its own kind.
 */
export type Reading = "full" | "sparse" | "stale" | "unknown" | "zero" | "not_applicable";

/**
 * CHAOS-12245, chris's ruling (2026-10-31): "web never shows the raw completeness state". The
 * answer's `completeness.state` is a machine field for programs, never display text: `complete`
 * adds nothing, `not_derived` (and a result with no completeness) renders nothing, and `partial`
 * or `degraded` add at most one plain sentence that names the data that was missing, from the
 * requirement rows. The coverage details keep their own block ("What limits this answer").
 */
export const MISSING_DATA_COPY = { lead: "Missing data" } as const;

/** The missing data of one requirement row, or `null` when it was read in full or does not apply. */
/**
 * What a requirement row needed: its obligation, else the requirement's first segment. An empty
 * obligation never reads as a blank (codex r1 on #1650); `""` when the row names nothing.
 */
function obligationOf(row: OutcomeRow, requirement: string): string {
    return row.obligation?.trim() || requirement.split("/")[0]?.trim() || "";
}

/** The completeness state words: never said, even as an obligation's name (codex r3 on #1650). */
const STATE_WORDS = new Set(["complete", "partial", "degraded", "not_derived"]);

function gapOf(row: OutcomeRow, requirement: string): string | null {
    const obligation = obligationOf(row, requirement);
    if (obligation === "" || STATE_WORDS.has(obligation.toLowerCase())) return null;
    const what = labelFor(OBLIGATION_LABEL, obligation).toLowerCase();
    switch (row.outcome) {
        case "narrowed":
            return row.declared > 0
                ? `${what} read in part (${row.served} of ${row.declared})`
                : `${what} read in part`;
        case "unavailable":
            return `${what} not available`;
        case "not_attempted":
            return `${what} not read`;
        default:
            return null;
    }
}

/**
 * The one sentence a `partial` or `degraded` answer adds: what was missing, by requirement, in the
 * order the rows name them. `null` for every other state, and when no row names a gap.
 */
export function missingDataSentence(completeness: Completeness | null): string | null {
    if (completeness === null) return null;
    if (completeness.state !== "partial" && completeness.state !== "degraded") return null;
    const gaps = [...lastOutcomeRows(completeness)]
        .map(([requirement, row]) => gapOf(row, requirement))
        .filter((gap): gap is string => gap !== null);
    return gaps.length === 0 ? null : `${MISSING_DATA_COPY.lead}: ${gaps.join("; ")}.`;
}

/** The answer's completeness, or `null` when the result carries none (an older stored result). */
export function completenessOf(result: CoverageResult): Completeness | null {
    const value = (result as { completeness?: Completeness }).completeness;
    return value && typeof value === "object" ? value : null;
}

/** How many facts and source rows stand behind the answer; zero is said as zero. */
export function factCountText(completeness: Completeness): string {
    const facts = completeness.claimed_facts_count;
    const rows = completeness.rows_count;
    if (facts === 0) return "No facts stand behind this answer.";
    const factWord = facts === 1 ? "1 fact" : `${facts.toLocaleString("en-US")} facts`;
    if (rows === 0) return `${factWord}, with no source rows.`;
    const rowWord = rows === 1 ? "1 source row" : `${rows.toLocaleString("en-US")} source rows`;
    return `${factWord} from ${rowWord}.`;
}

/** What each requirement needed, by obligation (open vocabulary). */
export const OBLIGATION_LABEL: Record<string, string> = {
    state: "Status",
    health: "Health",
    completion: "Completion",
    ranking: "Ranking",
    readiness: "Readiness",
    workload: "Workload",
    investment: "Investment",
    flow: "Flow",
};

export type RequirementLine = {
    readonly key: string;
    readonly label: string;
    readonly text: string;
    readonly reading: Reading;
};

/**
 * One line per requirement, from its EFFECTIVE row (the last row for it: later stages supersede
 * earlier ones). Rows with no requirement identity are not listed; they leave the state
 * `not_derived`, which the completeness line already says.
 */
/** Each requirement's last row: a later stage supersedes an earlier one. */
function lastOutcomeRows(completeness: Completeness): Map<string, OutcomeRow> {
    const last = new Map<string, OutcomeRow>();
    for (const row of completeness.outcomes ?? []) {
        if (row.requirement === undefined || row.requirement === "") continue;
        last.set(row.requirement, row);
    }
    return last;
}

export function requirementLines(completeness: Completeness): RequirementLine[] {
    return [...lastOutcomeRows(completeness).entries()].map(([requirement, row]) => {
        const label = labelFor(OBLIGATION_LABEL, obligationOf(row, requirement) || requirement);
        switch (row.outcome) {
            case "satisfied":
                return { key: requirement, label, text: "read in full", reading: "full" };
            case "narrowed":
                return {
                    key: requirement,
                    label,
                    text:
                        row.declared > 0
                            ? `read in part: ${row.served} of ${row.declared}`
                            : "read in part",
                    reading: "sparse",
                };
            case "not_applicable":
                return {
                    key: requirement,
                    label,
                    text: "does not apply",
                    reading: "not_applicable",
                };
            case "not_attempted":
                return { key: requirement, label, text: "not read: not known", reading: "unknown" };
            case "unavailable":
            default:
                return {
                    key: requirement,
                    label,
                    text: "not available: not known",
                    reading: "unknown",
                };
        }
    });
}

/**
 * Source states (open vocabulary). Each documented state has words of its own; `available` is the
 * only one that reads as read in full.
 */
const SOURCE_STATE: Record<string, { text: string; reading: Reading }> = {
    available: { text: "read", reading: "full" },
    truncated: { text: "partly included", reading: "sparse" },
    // ACR prunes a source no resolved subject can use ("not needed"): it was not read, by design.
    pruned: { text: "not needed for this question", reading: "not_applicable" },
    stale: { text: "stale", reading: "stale" },
    no_data: { text: "read: no data (zero rows)", reading: "zero" },
    not_applicable: { text: "does not apply", reading: "not_applicable" },
    unavailable: { text: "not available: not known", reading: "unknown" },
    unconfigured: { text: "not set up: not known", reading: "unknown" },
    unauthorized: { text: "not readable with your access: not known", reading: "unknown" },
    conflicted: { text: "sources disagree", reading: "unknown" },
};

export type SourceLine = {
    readonly key: string;
    readonly label: string;
    readonly text: string;
    readonly reading: Reading;
    /** When the source was observed, for a stale source. */
    readonly observedAt: string | null;
};

const dateText = (value: string | undefined): string | null => {
    if (value === undefined) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? null
        : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

/**
 * Each source the answer read, with ACR's display label and the state in this view's words. A
 * state this view does not know is shown by name and read as not known, never as read.
 */
export function sourceLines(result: CoverageResult): SourceLine[] {
    return (result.coverage?.sources ?? []).map((source, index) => {
        const known = Object.hasOwn(SOURCE_STATE, source.state)
            ? (SOURCE_STATE[source.state] as { text: string; reading: Reading })
            : null;
        return {
            key: `${source.source}-${index}`,
            label: nonBlank(source.label) ?? humanize(source.source),
            text: known?.text ?? `${humanize(source.state).toLowerCase()}: not known`,
            reading: known?.reading ?? "unknown",
            observedAt: source.state === "stale" ? dateText(source.observed_at) : null,
        };
    });
}

/** Coverage details that limited the answer, as ACR labelled them; degrading ones first. */
export function limitingDetails(result: CoverageResult): CoverageDetail[] {
    const details = result.coverage?.details ?? [];
    return [...details.filter((d) => d.degrading), ...details.filter((d) => !d.degrading)];
}

/**
 * Evidence entity types (the `<entity-type>` segment of an `acr:v1:<entity-type>:<id>` reference,
 * ACR's closed `ContextFabricEvidenceEntityType`), with the nouns of ACR's own registry. A `.v2`
 * successor names the same thing as the kind it replaces.
 */
const EVIDENCE_KIND: Record<string, [singular: string, plural: string]> = {
    commit: ["commit", "commits"],
    repository: ["repository", "repositories"],
    "work-item": ["work item", "work items"],
    "work-item-dependency": ["work item dependency", "work item dependencies"],
    "commit-file": ["commit file", "commit files"],
    "pull-request": ["pull request", "pull requests"],
    review: ["review", "reviews"],
    ci: ["CI run", "CI runs"],
    graph: ["relationship", "relationships"],
    "ai-run": ["AI workflow run", "AI workflow runs"],
    "ai-artifact": ["AI artifact", "AI artifacts"],
    "review-outcome": ["review outcome", "review outcomes"],
    deployment: ["deployment", "deployments"],
    incident: ["incident", "incidents"],
    "deployment-incident": ["deployment/incident link", "deployment/incident links"],
    hotspot: ["file hotspot", "file hotspots"],
    complexity: ["file complexity", "file complexities"],
    team: ["team", "teams"],
    project: ["project", "projects"],
    organization: ["organization", "organizations"],
    episode: ["episode", "episodes"],
    "work-item-hierarchy": ["work item hierarchy", "work item hierarchies"],
    "project-team": ["project/team link", "project/team links"],
    "work-item-team": ["work item/team link", "work item/team links"],
};

const kindOf = (refId: string): string => {
    const parts = refId.split(":");
    if (parts.length < 4 || parts[0] !== "acr" || parts[1] !== "v1") return "evidence";
    const kind = (parts[2] as string).replace(/\.v2$/u, "");
    return Object.hasOwn(EVIDENCE_KIND, kind) ? kind : "evidence";
};

export type EvidenceGroup = {
    readonly kind: string;
    readonly count: number;
    readonly text: string;
};

/**
 * References grouped by what they point at, largest group first. ACR's display label for a
 * reference carries the raw id ("Project: linear:<id>"), so this view shows the kind and the count
 * only: no id is ever shown. Opening a reference is not wired yet (CHAOS-12105).
 */
export function evidenceGroups(refIds: readonly string[]): EvidenceGroup[] {
    const counts = new Map<string, number>();
    for (const id of new Set(refIds)) counts.set(kindOf(id), (counts.get(kindOf(id)) ?? 0) + 1);
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([kind, count]) => {
            const [one, many] = EVIDENCE_KIND[kind] ?? ["other reference", "other references"];
            return {
                kind,
                count,
                text: `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`,
            };
        });
}

/** Every reference reachable on the answer: its own, and the closure ACR labelled. */
export function evidenceClosure(result: CoverageResult): string[] {
    return [
        ...new Set([...result.evidence_ref_ids, ...Object.keys(result.evidence_ref_labels ?? {})]),
    ];
}

/** Words this view writes (CHAOS-11932). */
export const COVERAGE_COPY = {
    title: "How complete this answer is",
    requirementsTitle: "What the answer needed",
    sourcesTitle: "Sources read",
    sourcesEmpty: "No sources reported: what was read is not known.",
    staleSince: "observed",
    limitsTitle: "What limits this answer",
    limitationsTitle: "Limitations the service named",
    warningsTitle: "Warnings",
    noLimitations: "No limitations named.",
    evidenceTitle: "Evidence",
    evidenceCited: "Cited by this answer",
    evidenceAll: "All evidence behind it",
    evidenceNone: "This answer cites no evidence.",
    evidenceNotOpenable: "Opening evidence from here is not available yet.",
} as const;
