/**
 * Canonical Evidence panel contract (CHAOS-2028 PRD — "Evidence panel contract").
 *
 * Single source of truth for what an Evidence panel is allowed to show:
 *
 * - The Evidence section renders ONLY typed artifacts (see {@link EvidenceArtifact}).
 *   Drivers, contributors, summaries, and suggestions are NOT artifacts and must
 *   never appear under "Evidence".
 * - Recommendations live in {@link EvidencePanelContract.recommendedNextStep},
 *   a separate slot — never mixed into the Evidence list.
 * - A panel with no real artifacts disables/renames its Evidence affordance
 *   rather than back-filling it with recommendations.
 *
 * Reused by CHAOS-2035 (Churn & Ownership hotspot evidence). Keep this stable.
 */

/** Artifact kinds the Evidence section is permitted to render. */
export type EvidenceArtifactType =
    "PR" | "commit" | "review" | "pipeline" | "incident" | "test" | "deployment";

/**
 * A single real, traceable artifact. Every field is required except `url`
 * (some artifacts have no canonical link). The Evidence section renders ONLY
 * values of this shape.
 */
export type EvidenceArtifact = {
    type: EvidenceArtifactType;
    /** Short human-facing identifier, e.g. "PR #412" or "deploy 8f3a1c2". */
    label: string;
    /** One-line plain-language description of what the artifact shows. */
    humanSummary: string;
    /** ISO-8601 timestamp for when the artifact occurred. */
    timestamp: string;
    /** Canonical link to the artifact, when one exists. */
    url?: string;
};

/** Confidence band for the panel's claim. */
export type EvidenceConfidence = "high" | "medium" | "low";

/**
 * The full Evidence panel contract. A panel either satisfies this shape with
 * real artifacts, or it has zero `evidenceItems` and its Evidence affordance is
 * disabled/renamed by the consuming UI.
 */
export type EvidencePanelContract = {
    /** The single, falsifiable claim the panel is making. */
    claim: string;
    /** Metric key the claim is grounded in. */
    metric: string;
    /** Current value, pre-formatted for display. */
    currentValue: string;
    /** Prior-window value, pre-formatted for display. */
    priorValue?: string;
    /** Pre-formatted delta between prior and current. */
    delta?: string;
    confidence: EvidenceConfidence;
    /** Typed artifacts — the ONLY thing the Evidence section renders. */
    evidenceItems: EvidenceArtifact[];
    /** What the evidence appears to suggest (read-only narration). */
    interpretation: string;
    /** A single recommendation. Lives outside the Evidence section. */
    recommendedNextStep: string;
    /** Honest limits on the claim (sampling, partial data, etc.). */
    caveats: string[];
};

/** Returns true when the panel has at least one real artifact to show. */
export function hasEvidenceArtifacts(panel: Pick<EvidencePanelContract, "evidenceItems">): boolean {
    return panel.evidenceItems.length > 0;
}
