/**
 * Shared numeric guards for render-safe chart inputs (CHAOS-2091).
 *
 * These pure helpers were duplicated across the TestOps risk page and the
 * IncidentCorrelationDashboard; they now live here as the single source of
 * truth so chart empty-state gating stays consistent everywhere.
 */

/** Narrow to a finite `number`, rejecting null/undefined/NaN/Infinity. */
export const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * A series is renderable when it carries at least two finite points — fewer
 * than two cannot form a trend line, so charts should fall back to an empty
 * state instead.
 */
export const hasRenderableSeries = (series: Array<{ value: number }>): boolean =>
  series.filter((point) => isFiniteNumber(point.value)).length >= 2;

/**
 * Enforce the 0–100 percentage contract.
 *
 * Inputs are expected to already be expressed in percentage points
 * (`1` means 1%, `50` means 50%) and are clamped into `[0, 100]`.
 *
 * NOTE: there is deliberately NO "fractional `[0,1]` → ×100" heuristic. That
 * ambiguity wrongly inflated legitimate low percentages — a real `1%` was
 * treated as `100%`, shoving a low-pass-rate repo into the wrong quadrant.
 * Producers must emit values already in 0–100 units (see the fetcher boundary
 * in `src/lib/testops/fetchers.ts`).
 */
export const normalizePercent = (value: number): number => Math.min(100, Math.max(0, value));
