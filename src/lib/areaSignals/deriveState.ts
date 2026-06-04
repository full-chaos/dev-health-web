// ── deriveState: value → severity ladder (CHAOS-2074) ─────────────────────────
//
// Maps a raw metric value to a {@link SignalSeverity}, mirroring the backend
// severity ladder but PARAMETERIZED by metric direction so a single helper
// serves both metric polarities:
//
//   - lower-is-better (`direction: "lowerIsBetter"`, e.g. flake %, pipeline
//     shortfall): a BIGGER value is worse, so the ladder is `value >= cut`.
//   - higher-is-better (`direction: "higherIsBetter"`, e.g. coverage %, release
//     confidence %): a SMALLER value is worse, so the ladder is `value < cut`.
//
// The backend ladder (>=60 critical, >=35 high, >=15 medium, else low) is the
// canonical lower-is-better shape; for higher-is-better metrics the issue gives
// per-family cut points applied to the value with `<` (e.g. coverage target 80:
// <50 crit, <65 high, <80 med, else low). Both idioms live here so callers never
// hand-roll a ladder. Thresholds are exported named constants so product can
// calibrate them in ONE place.

import type { SignalSeverity } from "@/lib/types";

export type SeverityThresholds = {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
};

// CHAOS-2074: provisional thresholds — pending product calibration.

/**
 * Canonical lower-is-better backend ladder (shortfall / count style):
 * value >= 60 critical, >= 35 high, >= 15 medium, else low.
 */
export const BACKEND_LADDER: SeverityThresholds = { critical: 60, high: 35, medium: 15 };

/**
 * Pipeline success-rate ladder, applied to the SHORTFALL s = 100 − successRate
 * (lower-is-better on the shortfall): s >= 40 crit, >= 25 high, >= 10 med.
 */
export const PIPELINE_SHORTFALL_THRESHOLDS: SeverityThresholds = {
  critical: 40,
  high: 25,
  medium: 10,
};

/**
 * Coverage ladder, applied to the coverage % directly (higher-is-better, `<`):
 * target 80 → < 50 crit, < 65 high, < 80 med, else low.
 */
export const COVERAGE_TARGET = 80 as const;
export const COVERAGE_THRESHOLDS: SeverityThresholds = { critical: 50, high: 65, medium: 80 };

/**
 * Test flake-rate ladder, applied to the flake % directly (lower-is-better):
 * >= 15 crit, >= 8 high, >= 3 med, else low.
 */
export const FLAKE_THRESHOLDS: SeverityThresholds = { critical: 15, high: 8, medium: 3 };

/**
 * Delivery / release-confidence ladder, applied to the confidence % directly
 * (higher-is-better, `<`): < 40 crit, < 55 high, < 70 med, else low.
 */
export const DELIVERY_RISK_THRESHOLDS: SeverityThresholds = {
  critical: 40,
  high: 55,
  medium: 70,
};

export type DeriveDirection = "lowerIsBetter" | "higherIsBetter";

export type DeriveStateOptions = {
  /** Severity cut points (see the exported constants). */
  thresholds: SeverityThresholds;
  /**
   * Metric polarity.
   *  - "lowerIsBetter": ladder is `value >= cut` (bigger = worse).
   *  - "higherIsBetter": ladder is `value < cut` (smaller = worse).
   */
  direction: DeriveDirection;
};

/**
 * Resolve a {@link SignalSeverity} for a metric value.
 *
 * Lower-is-better metrics compare with `>=` (a larger value is worse);
 * higher-is-better metrics compare with `<` (a smaller value is worse). Cut
 * points are checked from most to least severe so the worst matching band wins.
 */
export function deriveState(value: number, opts: DeriveStateOptions): SignalSeverity {
  const { thresholds, direction } = opts;

  if (direction === "higherIsBetter") {
    if (value < thresholds.critical) return "critical";
    if (value < thresholds.high) return "high";
    if (value < thresholds.medium) return "medium";
    return "low";
  }

  // lowerIsBetter
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.high) return "high";
  if (value >= thresholds.medium) return "medium";
  return "low";
}
