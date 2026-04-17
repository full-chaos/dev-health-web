import type { FeatureFlagsData } from "./types";

function generateSparkline(
  days: number,
  base: number,
  variance: number,
  trend: number = 0,
): Array<{ ts: string; value: number }> {
  const now = Date.now();
  const dayMs = 86_400_000;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * dayMs);
    const noise = (Math.sin(i * 1.3) + Math.cos(i * 0.7)) * variance;
    const value = Math.max(0, base + noise + trend * i);
    return {
      ts: date.toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
    };
  });
}

export const SAMPLE_FEATURE_FLAGS_DATA: FeatureFlagsData = {
  summary: {
    activeFlags: 23,
    activeFlagsDelta: 8.3,
    activeFlagsSpark: generateSparkline(14, 20, 2, 0.2),

    releaseFrictionDelta: 12.4,
    releaseFrictionSeverity: "moderate",
    releaseFrictionSpark: generateSparkline(14, 10, 3, 0.15),

    releaseErrorRateDelta: -2.1,
    releaseErrorRateSpark: generateSparkline(14, 5, 1.5, -0.1),

    coverageRatio: 72,
    coverageRatioDelta: 5.2,
    coverageRatioSpark: generateSparkline(14, 65, 4, 0.5),
  },
};
