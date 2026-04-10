import { describe, it, expect } from "vitest";
import { TESTOPS_MEASURES } from "../constants";

describe("TestOps Constants", () => {
  it("should define all 12 TestOps measures", () => {
    const expectedMeasures = [
      "PIPELINE_SUCCESS_RATE",
      "PIPELINE_FAILURE_RATE",
      "PIPELINE_DURATION_P95",
      "PIPELINE_QUEUE_TIME",
      "PIPELINE_RERUN_RATE",
      "TEST_PASS_RATE",
      "TEST_FAILURE_RATE",
      "TEST_FLAKE_RATE",
      "TEST_SUITE_DURATION_P95",
      "COVERAGE_LINE_PCT",
      "COVERAGE_BRANCH_PCT",
      "COVERAGE_DELTA_PCT",
    ];

    expect(Object.keys(TESTOPS_MEASURES)).toHaveLength(12);
    
    expectedMeasures.forEach((measure) => {
      expect(TESTOPS_MEASURES).toHaveProperty(measure);
      expect(TESTOPS_MEASURES[measure].id).toBe(measure);
      expect(TESTOPS_MEASURES[measure].label).toBeDefined();
      expect(TESTOPS_MEASURES[measure].description).toBeDefined();
      expect(TESTOPS_MEASURES[measure].unit).toBeDefined();
      expect(TESTOPS_MEASURES[measure].goodDirection).toBeDefined();
    });
  });

  it("should have correct units for percentage measures", () => {
    expect(TESTOPS_MEASURES.PIPELINE_SUCCESS_RATE.unit).toBe("percentage");
    expect(TESTOPS_MEASURES.TEST_PASS_RATE.unit).toBe("percentage");
    expect(TESTOPS_MEASURES.COVERAGE_LINE_PCT.unit).toBe("percentage");
  });

  it("should have correct units for duration measures", () => {
    expect(TESTOPS_MEASURES.PIPELINE_DURATION_P95.unit).toBe("duration");
    expect(TESTOPS_MEASURES.PIPELINE_QUEUE_TIME.unit).toBe("duration");
    expect(TESTOPS_MEASURES.TEST_SUITE_DURATION_P95.unit).toBe("duration");
  });
});
