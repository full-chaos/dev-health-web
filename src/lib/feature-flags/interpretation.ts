/**
 * PRD language policy: forbidden words in UI copy are "caused", "proved",
 * "determined", "detected". Required hedges: "appears", "suggests", "leans",
 * "is consistent with".
 */

export const CONFIDENCE_SHOW_THRESHOLD = 0.7;
export const CONFIDENCE_WARN_THRESHOLD = 0.5;
export const DATA_COMPLETENESS_THRESHOLD = 0.8;

type Direction = "higher" | "lower";

function directionLabel(direction: Direction): string {
  return direction === "higher" ? "higher" : "lower";
}

export const INTERPRETATION_COPY = {
  frictionDelta: (direction: Direction) =>
    `Friction rate appears ${directionLabel(direction)} after this release`,
  errorDelta: (direction: Direction) =>
    `Error rate appears ${directionLabel(direction)} after this release`,
  latencyDelta: (direction: Direction) =>
    `Latency appears ${directionLabel(direction)} after this release`,
  throughputDelta: (direction: Direction) =>
    `Throughput appears ${directionLabel(direction)} after this release`,
  adoptionDelta: (direction: Direction) =>
    `Adoption rate appears ${directionLabel(direction)} after this release`,
  rollbackRate: (direction: Direction) =>
    `Rollback frequency appears ${directionLabel(direction)} after this release`,
} as const;

export const CONTEXT_LABELS = {
  attributionWindow: "Attribution window",
  confidenceScore: "Confidence",
  coverageRatio: "Coverage",
  concurrentDeploys: "Concurrent deploys",
  contamination: "Cohort contamination",
  dataCompleteness: "Data completeness",
} as const;

export const GATE_COPY = {
  warnTooltip:
    "Confidence is reduced. Coverage or sample size suggests these numbers may shift as more data arrives.",
  suppressedDefault:
    "Insufficient data to display this metric. Coverage is below the minimum threshold.",
  dataArriving:
    "Data is still arriving. Numbers shown may change as the attribution window completes.",
  contamination: (pct: number) =>
    `${(pct * 100).toFixed(1)}% of sessions were exposed to multiple concurrent flags`,
  concurrentDeploys: (count: number) =>
    `${count} other deploy${count === 1 ? "" : "s"} occurred during this attribution window`,
} as const;

const FORBIDDEN_WORDS = ["caused", "proved", "determined", "detected"] as const;

/**
 * Returns forbidden causal words found in text.
 * Used by snapshot tests that guard UI copy against policy violations.
 */
export function findForbiddenLanguage(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_WORDS.filter((word) => lower.includes(word));
}
