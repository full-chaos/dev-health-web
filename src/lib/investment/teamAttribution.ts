/**
 * Team-attribution provenance presentation helpers (CHAOS-2608 / CS7).
 *
 * Team attribution is computed BACKEND-ONLY (ClickHouse system-of-record) and
 * exposed via the `workItemTeamAttributions` GraphQL field. The web layer is
 * render-only: these helpers map the backend `TeamAttributionSource` /
 * `TeamAttributionConfidence` enums to display labels and a visual tone. They
 * never recompute attribution — they only describe what the backend resolved.
 *
 * `MANUAL_FALLBACK` is deliberately surfaced as a DISTINCT, lower-confidence
 * label. It is a backstop guess (not native/issue/ownership truth) and must
 * never be presented as authoritative team truth.
 */

import type {
    TeamAttributionConfidence,
    TeamAttributionSource,
    WorkItemTeamAttribution,
} from "@/lib/graphql/__generated__/types";

export type AttributionTone = "trusted" | "derived" | "weak" | "fallback" | "none";

export type AttributionProvenance = {
    /** Short uppercase chip label, e.g. "NATIVE TEAM". */
    sourceLabel: string;
    /** Short confidence label, e.g. "high confidence". */
    confidenceLabel: string;
    /** Visual tone bucket used to pick badge styling. */
    tone: AttributionTone;
    /** True only for the manual backstop — rendered as a distinct low-confidence label. */
    isManualFallback: boolean;
    /** Longer sentence suitable for a tooltip / aria description. */
    description: string;
};

/**
 * Backend source precedence (highest trust first). Mirrors the ops
 * team-attribution resolver; used here ONLY for display ordering / wording.
 */
export const ATTRIBUTION_SOURCE_PRECEDENCE: readonly TeamAttributionSource[] = [
    "NATIVE_TEAM",
    "ISSUE_PROJECT",
    "PROJECT_OWNERSHIP",
    "REPO_OWNERSHIP",
    "ASSIGNEE_MEMBERSHIP",
    "LINKED_ISSUE",
    // CHAOS-4244: the PR/MR author as a membership candidate, ranked BELOW
    // linked_issue and ABOVE manual_fallback — a person signal ("at best a
    // low-precedence fallback", chris's ruling superseding the first cut
    // that folded it into assignee_membership) that must never beat a real
    // structural or relationship fact, but is still a resolved identity
    // lookup, not a bare guess.
    "AUTHOR_MEMBERSHIP",
    "MANUAL_FALLBACK",
    "UNASSIGNED",
] as const;

const SOURCE_LABELS: Record<TeamAttributionSource, string> = {
    NATIVE_TEAM: "Native team",
    ISSUE_PROJECT: "Issue project",
    PROJECT_OWNERSHIP: "Project ownership",
    REPO_OWNERSHIP: "Repo ownership",
    ASSIGNEE_MEMBERSHIP: "Assignee membership",
    LINKED_ISSUE: "Linked issue",
    AUTHOR_MEMBERSHIP: "Author membership",
    MANUAL_FALLBACK: "Manual fallback",
    UNASSIGNED: "Unassigned",
};

const SOURCE_TONES: Record<TeamAttributionSource, AttributionTone> = {
    NATIVE_TEAM: "trusted",
    ISSUE_PROJECT: "trusted",
    PROJECT_OWNERSHIP: "derived",
    REPO_OWNERSHIP: "derived",
    ASSIGNEE_MEMBERSHIP: "weak",
    LINKED_ISSUE: "weak",
    // "fallback", not "weak": ranked directly above MANUAL_FALLBACK, and
    // chris's own CHAOS-4244 ruling frames it in the same low-precedence
    // terms — a person happening to author an item is not a structural
    // signal the way an assignee field or a linked issue is.
    AUTHOR_MEMBERSHIP: "fallback",
    MANUAL_FALLBACK: "fallback",
    UNASSIGNED: "none",
};

const SOURCE_DESCRIPTIONS: Record<TeamAttributionSource, string> = {
    NATIVE_TEAM: "Team came directly from the provider's native team field.",
    ISSUE_PROJECT: "Team resolved from the issue's project.",
    PROJECT_OWNERSHIP: "Team resolved from project ownership.",
    REPO_OWNERSHIP: "Team resolved from repository ownership.",
    ASSIGNEE_MEMBERSHIP: "Team inferred from the assignee's team membership.",
    LINKED_ISSUE: "Team resolved from a linked issue.",
    AUTHOR_MEMBERSHIP:
        "Team inferred from the PR/MR author's team membership — a low-precedence fallback, not authoritative team truth.",
    MANUAL_FALLBACK: "No reliable signal — a manual backstop guess, not authoritative team truth.",
    UNASSIGNED: "No team could be attributed for this work item.",
};

const CONFIDENCE_LABELS: Record<TeamAttributionConfidence, string> = {
    HIGH: "high confidence",
    MEDIUM: "medium confidence",
    LOW: "low confidence",
    MANUAL: "manual · low confidence",
    NONE: "no confidence",
};

/**
 * Describe a backend attribution for render-only display. Pure: no recompute.
 */
export function describeAttributionProvenance(attribution: {
    source: TeamAttributionSource;
    confidence: TeamAttributionConfidence;
}): AttributionProvenance {
    const { source, confidence } = attribution;
    const isManualFallback = source === "MANUAL_FALLBACK";
    return {
        sourceLabel: SOURCE_LABELS[source],
        confidenceLabel: CONFIDENCE_LABELS[confidence],
        tone: SOURCE_TONES[source],
        isManualFallback,
        description: `${SOURCE_DESCRIPTIONS[source]} (${CONFIDENCE_LABELS[confidence]})`,
    };
}

/**
 * Return the backend-designated primary (`is_primary`) attribution for a work
 * item, or `null` when none is flagged.
 *
 * The winner is decided BACKEND-ONLY: `is_primary` is the resolver's
 * highest-precedence candidate. The web layer must NOT pick a winner itself —
 * doing so (e.g. by sorting candidates on a client-side precedence list) would
 * recompute attribution, the exact boundary violation CS7 removes. If the
 * backend flags no primary, we surface no primary (the caller shows nothing /
 * an unassigned state) rather than inventing one.
 */
export function selectPrimaryAttribution(
    attributions: readonly WorkItemTeamAttribution[],
): WorkItemTeamAttribution | null {
    return attributions.find((a) => a.isPrimary) ?? null;
}
