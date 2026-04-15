export type FeatureFlagMeasureDef = {
  id: string;
  label: string;
  description: string;
  unit: "percentage" | "count" | "number" | "delta";
  goodDirection: "up" | "down" | "neutral";
};

export const FF_MEASURES: Record<string, FeatureFlagMeasureDef> = {
  ACTIVE_FLAGS: {
    id: "ACTIVE_FLAGS",
    label: "Active Flags",
    description: "Number of feature flags currently enabled in production",
    unit: "count",
    goodDirection: "neutral",
  },
  RELEASE_FRICTION_DELTA: {
    id: "RELEASE_FRICTION_DELTA",
    label: "Release Friction Delta",
    description: "Change in release friction score across recent deployments",
    unit: "delta",
    goodDirection: "down",
  },
  RELEASE_ERROR_RATE_DELTA: {
    id: "RELEASE_ERROR_RATE_DELTA",
    label: "Release Error Rate Delta",
    description: "Change in error rate between pre- and post-deployment windows",
    unit: "delta",
    goodDirection: "down",
  },
  COVERAGE_RATIO: {
    id: "COVERAGE_RATIO",
    label: "Coverage Ratio",
    description: "Percentage of releases with feature flag telemetry attached",
    unit: "percentage",
    goodDirection: "up",
  },
};
