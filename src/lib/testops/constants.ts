import { MeasureInput } from "@/lib/graphql/schemas/analytics";

export type TestOpsMeasureDef = {
  id: MeasureInput;
  label: string;
  description: string;
  unit: "percentage" | "duration" | "count" | "number";
  goodDirection: "up" | "down";
};

export const TESTOPS_MEASURES: Record<string, TestOpsMeasureDef> = {
  PIPELINE_SUCCESS_RATE: {
    id: "PIPELINE_SUCCESS_RATE",
    label: "Success Rate",
    description: "Percentage of pipeline runs that complete successfully",
    unit: "percentage",
    goodDirection: "up",
  },
  PIPELINE_FAILURE_RATE: {
    id: "PIPELINE_FAILURE_RATE",
    label: "Failure Rate",
    description: "Percentage of pipeline runs that fail",
    unit: "percentage",
    goodDirection: "down",
  },
  PIPELINE_DURATION_P95: {
    id: "PIPELINE_DURATION_P95",
    label: "P95 Duration",
    description: "95th percentile of pipeline execution time",
    unit: "duration",
    goodDirection: "down",
  },
  PIPELINE_QUEUE_TIME: {
    id: "PIPELINE_QUEUE_TIME",
    label: "Queue Time",
    description: "Average time pipelines spend waiting to start",
    unit: "duration",
    goodDirection: "down",
  },
  PIPELINE_RERUN_RATE: {
    id: "PIPELINE_RERUN_RATE",
    label: "Rerun Rate",
    description: "Percentage of pipelines that are rerun",
    unit: "percentage",
    goodDirection: "down",
  },
  TEST_PASS_RATE: {
    id: "TEST_PASS_RATE",
    label: "Pass Rate",
    description: "Percentage of tests that pass",
    unit: "percentage",
    goodDirection: "up",
  },
  TEST_FAILURE_RATE: {
    id: "TEST_FAILURE_RATE",
    label: "Failure Rate",
    description: "Percentage of tests that fail",
    unit: "percentage",
    goodDirection: "down",
  },
  TEST_FLAKE_RATE: {
    id: "TEST_FLAKE_RATE",
    label: "Flake Rate",
    description: "Percentage of tests that exhibit flaky behavior",
    unit: "percentage",
    goodDirection: "down",
  },
  TEST_SUITE_DURATION_P95: {
    id: "TEST_SUITE_DURATION_P95",
    label: "P95 Suite Duration",
    description: "95th percentile of test suite execution time",
    unit: "duration",
    goodDirection: "down",
  },
  COVERAGE_LINE_PCT: {
    id: "COVERAGE_LINE_PCT",
    label: "Line Coverage",
    description: "Percentage of code lines covered by tests",
    unit: "percentage",
    goodDirection: "up",
  },
  COVERAGE_BRANCH_PCT: {
    id: "COVERAGE_BRANCH_PCT",
    label: "Branch Coverage",
    description: "Percentage of code branches covered by tests",
    unit: "percentage",
    goodDirection: "up",
  },
  COVERAGE_DELTA_PCT: {
    id: "COVERAGE_DELTA_PCT",
    label: "Coverage Delta",
    description: "Change in coverage percentage",
    unit: "percentage",
    goodDirection: "up",
  },
};
