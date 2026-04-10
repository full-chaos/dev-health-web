import { AnalyticsResult } from "@/lib/graphql/schemas/analytics";

export const SAMPLE_PIPELINES_DATA: AnalyticsResult = {
  timeseries: [
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "PIPELINE_SUCCESS_RATE",
      buckets: [
        { date: "2024-01-01", value: 85 },
        { date: "2024-01-02", value: 87 },
        { date: "2024-01-03", value: 82 },
        { date: "2024-01-04", value: 88 },
        { date: "2024-01-05", value: 90 },
        { date: "2024-01-06", value: 92 },
        { date: "2024-01-07", value: 91 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "PIPELINE_FAILURE_RATE",
      buckets: [
        { date: "2024-01-01", value: 15 },
        { date: "2024-01-02", value: 13 },
        { date: "2024-01-03", value: 18 },
        { date: "2024-01-04", value: 12 },
        { date: "2024-01-05", value: 10 },
        { date: "2024-01-06", value: 8 },
        { date: "2024-01-07", value: 9 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "PIPELINE_DURATION_P95",
      buckets: [
        { date: "2024-01-01", value: 15 },
        { date: "2024-01-02", value: 14 },
        { date: "2024-01-03", value: 16 },
        { date: "2024-01-04", value: 13 },
        { date: "2024-01-05", value: 12 },
        { date: "2024-01-06", value: 11 },
        { date: "2024-01-07", value: 12 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "PIPELINE_QUEUE_TIME",
      buckets: [
        { date: "2024-01-01", value: 2 },
        { date: "2024-01-02", value: 1.5 },
        { date: "2024-01-03", value: 3 },
        { date: "2024-01-04", value: 1.2 },
        { date: "2024-01-05", value: 1 },
        { date: "2024-01-06", value: 0.8 },
        { date: "2024-01-07", value: 1 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "PIPELINE_RERUN_RATE",
      buckets: [
        { date: "2024-01-01", value: 5 },
        { date: "2024-01-02", value: 4 },
        { date: "2024-01-03", value: 6 },
        { date: "2024-01-04", value: 3 },
        { date: "2024-01-05", value: 2 },
        { date: "2024-01-06", value: 2 },
        { date: "2024-01-07", value: 2.5 },
      ],
    },
  ],
  breakdowns: [
    {
      dimension: "TEAM",
      measure: "PIPELINE_FAILURE_RATE",
      items: [
        { key: "Monday", value: 15 },
        { key: "Tuesday", value: 12 },
        { key: "Wednesday", value: 18 },
        { key: "Thursday", value: 10 },
        { key: "Friday", value: 8 },
      ],
    },
  ],
};

export const SAMPLE_TESTS_DATA: AnalyticsResult = {
  timeseries: [
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "TEST_PASS_RATE",
      buckets: [
        { date: "2024-01-01", value: 98 },
        { date: "2024-01-02", value: 98.5 },
        { date: "2024-01-03", value: 97 },
        { date: "2024-01-04", value: 99 },
        { date: "2024-01-05", value: 99.2 },
        { date: "2024-01-06", value: 99.5 },
        { date: "2024-01-07", value: 99.1 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "TEST_FAILURE_RATE",
      buckets: [
        { date: "2024-01-01", value: 2 },
        { date: "2024-01-02", value: 1.5 },
        { date: "2024-01-03", value: 3 },
        { date: "2024-01-04", value: 1 },
        { date: "2024-01-05", value: 0.8 },
        { date: "2024-01-06", value: 0.5 },
        { date: "2024-01-07", value: 0.9 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "TEST_FLAKE_RATE",
      buckets: [
        { date: "2024-01-01", value: 1.5 },
        { date: "2024-01-02", value: 1.2 },
        { date: "2024-01-03", value: 2.1 },
        { date: "2024-01-04", value: 0.9 },
        { date: "2024-01-05", value: 0.7 },
        { date: "2024-01-06", value: 0.4 },
        { date: "2024-01-07", value: 0.8 },
      ],
    },
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "TEST_SUITE_DURATION_P95",
      buckets: [
        { date: "2024-01-01", value: 5 },
        { date: "2024-01-02", value: 4.8 },
        { date: "2024-01-03", value: 5.5 },
        { date: "2024-01-04", value: 4.5 },
        { date: "2024-01-05", value: 4.2 },
        { date: "2024-01-06", value: 4.0 },
        { date: "2024-01-07", value: 4.3 },
      ],
    },
  ],
  breakdowns: [
    {
      dimension: "TEAM",
      measure: "TEST_FLAKE_RATE",
      items: [
        { key: "Frontend", value: 2.5 },
        { key: "Backend", value: 1.2 },
        { key: "Mobile", value: 3.1 },
      ],
    },
  ],
};

export const SAMPLE_COVERAGE_DATA: AnalyticsResult = {
  timeseries: [
    {
      dimension: "TEAM",
      dimensionValue: "all",
      measure: "COVERAGE_LINE_PCT",
      buckets: [
        { date: "2024-01-01", value: 80 },
        { date: "2024-01-02", value: 80.5 },
        { date: "2024-01-03", value: 81 },
        { date: "2024-01-04", value: 81.2 },
        { date: "2024-01-05", value: 81.5 },
        { date: "2024-01-06", value: 82 },
        { date: "2024-01-07", value: 82.1 },
      ],
    },
  ],
  breakdowns: [],
};
