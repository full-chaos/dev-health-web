/**
 * Tests for the filter utilities used by FilterBar.
 * These test the pure logic functions that power the FilterBar component.
 */
import { describe, it, expect } from "vitest";
import { defaultMetricFilter } from "../filters/defaults";
import { encodeFilterParam, decodeFilter } from "../filters/encode";
import type { MetricFilter } from "../filters/types";

// ============================================================================
// defaultMetricFilter
// ============================================================================
describe("defaultMetricFilter", () => {
  it("has a scope with level 'team'", () => {
    expect(defaultMetricFilter.scope.level).toBe("team");
  });

  it("has empty scope ids by default", () => {
    expect(defaultMetricFilter.scope.ids).toEqual([]);
  });

  it("has a positive range_days value", () => {
    expect(defaultMetricFilter.time.range_days).toBeGreaterThan(0);
  });
});

// ============================================================================
// encodeFilterParam / decodeFilter — round-trip
// ============================================================================
describe("encodeFilterParam / decodeFilter round-trip", () => {
  it("survives a round-trip for the default filter", () => {
    const encoded = encodeFilterParam(defaultMetricFilter);
    const decoded = decodeFilter(encoded);
    expect(decoded.scope.level).toBe(defaultMetricFilter.scope.level);
    expect(decoded.time.range_days).toBe(defaultMetricFilter.time.range_days);
  });

  it("survives a round-trip with custom scope ids", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      scope: { level: "team", ids: ["eng-team", "platform-team"] },
    };
    const encoded = encodeFilterParam(filter);
    const decoded = decodeFilter(encoded);
    expect(decoded.scope.ids).toEqual(["eng-team", "platform-team"]);
  });

  it("survives a round-trip with date range", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      time: {
        ...defaultMetricFilter.time,
        start_date: "2024-01-01",
        end_date: "2024-01-31",
        range_days: 30,
      },
    };
    const encoded = encodeFilterParam(filter);
    const decoded = decodeFilter(encoded);
    expect(decoded.time.start_date).toBe("2024-01-01");
    expect(decoded.time.end_date).toBe("2024-01-31");
  });

  it("survives a round-trip with developer filters", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      who: { ...defaultMetricFilter.who, developers: ["alice", "bob"] },
    };
    const encoded = encodeFilterParam(filter);
    const decoded = decodeFilter(encoded);
    expect(decoded.who.developers).toEqual(["alice", "bob"]);
  });

  it("decodes null/undefined as the default filter", () => {
    const decoded = decodeFilter(null);
    expect(decoded.scope.level).toBe(defaultMetricFilter.scope.level);
  });

  it("decodes malformed strings without throwing", () => {
    const decoded = decodeFilter("not-valid-json!!!");
    expect(decoded).toBeDefined();
    expect(typeof decoded.scope.level).toBe("string");
  });
});

// ============================================================================
// MetricFilter shape invariants
// ============================================================================
describe("MetricFilter shape", () => {
  it("all scope level values are valid union members", () => {
    const validLevels = ["org", "team", "repo", "service", "developer"];
    const decoded = decodeFilter(encodeFilterParam(defaultMetricFilter));
    expect(validLevels).toContain(decoded.scope.level);
  });

  it("who.developers defaults to an array", () => {
    const decoded = decodeFilter(null);
    expect(Array.isArray(decoded.who.developers)).toBe(true);
  });

  it("how.flow_stage defaults to an array", () => {
    const decoded = decodeFilter(null);
    expect(Array.isArray(decoded.how.flow_stage)).toBe(true);
  });
});
