import { describe, expect, it } from "vitest";

import { hasRenderableSeries, isFiniteNumber, normalizePercent } from "../numbers";

describe("isFiniteNumber", () => {
  it("accepts finite numbers including zero and negatives", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(-42.5)).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe("normalizePercent", () => {
  it("treats values already in 0-100 units as-is (no fractional ×100 heuristic)", () => {
    // Regression guard (CHAOS-2091): a legitimate 0.5% / 1% must NOT be
    // inflated into 50 / 100 — that wrongly shoved low-pass-rate repos into
    // the top-right quadrant.
    expect(normalizePercent(0.5)).toBe(0.5);
    expect(normalizePercent(1)).toBe(1);
    expect(normalizePercent(50)).toBe(50);
    expect(normalizePercent(100)).toBe(100);
  });

  it("clamps out-of-range values into [0, 100]", () => {
    expect(normalizePercent(-5)).toBe(0);
    expect(normalizePercent(150)).toBe(100);
    expect(normalizePercent(0)).toBe(0);
  });
});

describe("hasRenderableSeries", () => {
  it("requires at least two finite points to render a trend", () => {
    expect(hasRenderableSeries([])).toBe(false);
    expect(hasRenderableSeries([{ value: 1 }])).toBe(false);
    expect(hasRenderableSeries([{ value: 1 }, { value: 2 }])).toBe(true);
  });

  it("ignores non-finite points when counting renderable data", () => {
    expect(hasRenderableSeries([{ value: Number.NaN }, { value: 1 }])).toBe(false);
    expect(
      hasRenderableSeries([{ value: Number.POSITIVE_INFINITY }, { value: 1 }, { value: 2 }]),
    ).toBe(true);
  });
});
