import type { SparkPoint } from "@/lib/types";

export type FeatureFlagSummary = {
  activeFlags: number;
  activeFlagsDelta: number;
  activeFlagsSpark: SparkPoint[];

  releaseFrictionDelta: number;
  releaseFrictionSeverity: "low" | "moderate" | "high" | "critical";
  releaseFrictionSpark: SparkPoint[];

  releaseErrorRateDelta: number;
  releaseErrorRateSpark: SparkPoint[];

  coverageRatio: number;
  coverageRatioDelta: number;
  coverageRatioSpark: SparkPoint[];
};

export type FeatureFlagsData = {
  summary: FeatureFlagSummary;
};
