export type MetricStability = "stable" | "provisional" | "rejected";

export type FeatureFlagMeasureDef = {
  id: string;
  label: string;
  description: string;
  unit: "percentage" | "count" | "number" | "delta" | "ratio" | "hours";
  goodDirection: "up" | "down" | "neutral";
  stability: MetricStability;
};

export const FF_MEASURES: Record<string, FeatureFlagMeasureDef> = {
  // ── Stable metrics ──────────────────────────────────────────────────
  RELEASE_FRICTION_DELTA: {
    id: "RELEASE_FRICTION_DELTA",
    label: "Release Friction Delta",
    description:
      "Change in user friction signals per session compared to a 7-day baseline",
    unit: "delta",
    goodDirection: "down",
    stability: "stable",
  },
  RELEASE_ERROR_RATE_DELTA: {
    id: "RELEASE_ERROR_RATE_DELTA",
    label: "Release Error Rate Delta",
    description:
      "Change in error rate between pre- and post-deployment windows",
    unit: "delta",
    goodDirection: "down",
    stability: "stable",
  },
  RELEASE_IMPACT_CONFIDENCE: {
    id: "RELEASE_IMPACT_CONFIDENCE",
    label: "Impact Confidence Score",
    description:
      "Composite score reflecting telemetry coverage, sample size, and confounder presence",
    unit: "ratio",
    goodDirection: "up",
    stability: "stable",
  },
  COVERAGE_RATIO: {
    id: "COVERAGE_RATIO",
    label: "Impact Coverage Ratio",
    description:
      "Fraction of releases with telemetry data attached on a given day",
    unit: "percentage",
    goodDirection: "up",
    stability: "stable",
  },

  // ── Provisional metrics (beta) ──────────────────────────────────────
  TIME_TO_FIRST_USER_ISSUE: {
    id: "TIME_TO_FIRST_USER_ISSUE",
    label: "Time to First User Issue",
    description:
      "Hours between deployment and the first linked user-reported issue",
    unit: "hours",
    goodDirection: "down",
    stability: "provisional",
  },
  FLAG_EXPOSURE_RATE: {
    id: "FLAG_EXPOSURE_RATE",
    label: "Flag Exposure Rate",
    description:
      "Ratio of sessions that encountered the flag versus all eligible sessions",
    unit: "ratio",
    goodDirection: "neutral",
    stability: "provisional",
  },
  FLAG_ACTIVATION_RATE: {
    id: "FLAG_ACTIVATION_RATE",
    label: "Flag Activation Rate",
    description:
      "Ratio of exposed sessions that performed a defined success action",
    unit: "ratio",
    goodDirection: "up",
    stability: "provisional",
  },
  FLAG_RELIABILITY_GUARDRAIL: {
    id: "FLAG_RELIABILITY_GUARDRAIL",
    label: "Flag Reliability Guardrail",
    description:
      "Ratio of error-free sessions in the exposed cohort",
    unit: "ratio",
    goodDirection: "up",
    stability: "provisional",
  },
  FLAG_FRICTION_DELTA: {
    id: "FLAG_FRICTION_DELTA",
    label: "Flag Friction Delta",
    description:
      "Change in friction signals scoped to the flag exposure window",
    unit: "delta",
    goodDirection: "down",
    stability: "provisional",
  },
  ISSUE_TO_RELEASE_LINK_RATE: {
    id: "ISSUE_TO_RELEASE_LINK_RATE",
    label: "Issue-to-Release Link Rate",
    description:
      "Fraction of completed work items with measurable post-release signal",
    unit: "ratio",
    goodDirection: "up",
    stability: "provisional",
  },
  ROLLBACK_AFTER_IMPACT: {
    id: "ROLLBACK_AFTER_IMPACT",
    label: "Rollback/Disable After Impact",
    description:
      "Count of flag disable or rollback events within 72 hours of deployment",
    unit: "count",
    goodDirection: "down",
    stability: "provisional",
  },

  // ── Rejected metrics (not displayed, kept for reference) ────────────
  FLAG_ROLLOUT_HALF_LIFE: {
    id: "FLAG_ROLLOUT_HALF_LIFE",
    label: "Flag Rollout Half-Life",
    description:
      "Hours from first rollout event to 50% exposure — rejected due to provider-specific denominator",
    unit: "hours",
    goodDirection: "neutral",
    stability: "rejected",
  },
  FLAG_CHURN_RATE: {
    id: "FLAG_CHURN_RATE",
    label: "Flag Churn Rate",
    description:
      "Toggle/rule-change frequency per week — rejected due to misuse risk and interpretation ambiguity",
    unit: "count",
    goodDirection: "neutral",
    stability: "rejected",
  },

  // ── Operational (not in PRD catalog, retained from prior iteration) ─
  ACTIVE_FLAGS: {
    id: "ACTIVE_FLAGS",
    label: "Active Flags",
    description: "Number of feature flags currently enabled in production",
    unit: "count",
    goodDirection: "neutral",
    stability: "stable",
  },
};
