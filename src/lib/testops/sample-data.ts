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
        {
            dimension: "TEAM",
            dimensionValue: "all",
            measure: "COVERAGE_BRANCH_PCT",
            buckets: [
                { date: "2024-01-01", value: 75 },
                { date: "2024-01-02", value: 75.5 },
                { date: "2024-01-03", value: 76 },
                { date: "2024-01-04", value: 76.2 },
                { date: "2024-01-05", value: 76.5 },
                { date: "2024-01-06", value: 77 },
                { date: "2024-01-07", value: 77.1 },
            ],
        },
        {
            dimension: "TEAM",
            dimensionValue: "all",
            measure: "COVERAGE_DELTA_PCT",
            buckets: [
                { date: "2024-01-01", value: 0.1 },
                { date: "2024-01-02", value: 0.5 },
                { date: "2024-01-03", value: 0.5 },
                { date: "2024-01-04", value: 0.2 },
                { date: "2024-01-05", value: 0.3 },
                { date: "2024-01-06", value: 0.5 },
                { date: "2024-01-07", value: 0.1 },
            ],
        },
    ],
    breakdowns: [
        {
            dimension: "REPO",
            measure: "COVERAGE_LINE_PCT",
            items: [
                { key: "frontend-web", value: 85.2 },
                { key: "backend-api", value: 92.1 },
                { key: "mobile-app", value: 68.5 },
                { key: "data-pipeline", value: 74.3 },
                { key: "auth-service", value: 98.0 },
            ],
        },
    ],
};

export const SAMPLE_RISK_DATA = {
    release_confidence: 0.82,
    quality_drag_hours: 14.5,
    pipeline_stability: 0.88,
    timeseries: [
        { date: "2024-01-01", riskScore: 0.4 },
        { date: "2024-01-02", riskScore: 0.35 },
        { date: "2024-01-03", riskScore: 0.45 },
        { date: "2024-01-04", riskScore: 0.3 },
        { date: "2024-01-05", riskScore: 0.25 },
        { date: "2024-01-06", riskScore: 0.2 },
        { date: "2024-01-07", riskScore: 0.18 },
    ],
    quality_drag_breakdown: [
        { category: "Failure Rework", hours: 6.5 },
        { category: "Flake Investigation", hours: 4.0 },
        { category: "Queue Wait", hours: 2.5 },
        { category: "Retry Overhead", hours: 1.5 },
    ],
    quadrant_data: [
        { id: "frontend-web", pipeline_success_rate: 85, test_pass_rate: 98 },
        { id: "backend-api", pipeline_success_rate: 95, test_pass_rate: 99 },
        { id: "mobile-app", pipeline_success_rate: 70, test_pass_rate: 92 },
        { id: "data-pipeline", pipeline_success_rate: 60, test_pass_rate: 85 },
        { id: "auth-service", pipeline_success_rate: 98, test_pass_rate: 100 },
    ],
    confidence_spark: [
        { ts: "2024-01-01", value: 60 },
        { ts: "2024-01-02", value: 65 },
        { ts: "2024-01-03", value: 55 },
        { ts: "2024-01-04", value: 70 },
        { ts: "2024-01-05", value: 75 },
        { ts: "2024-01-06", value: 80 },
        { ts: "2024-01-07", value: 82 },
    ],
    confidence_delta: 36.7,
    drag_spark: [
        { ts: "2024-01-01", value: 22 },
        { ts: "2024-01-02", value: 19 },
        { ts: "2024-01-03", value: 24 },
        { ts: "2024-01-04", value: 17 },
        { ts: "2024-01-05", value: 15.5 },
        { ts: "2024-01-06", value: 14.8 },
        { ts: "2024-01-07", value: 14.5 },
    ],
    drag_delta: -34.1,
    stability_spark: [
        { ts: "2024-01-01", value: 80 },
        { ts: "2024-01-02", value: 82 },
        { ts: "2024-01-03", value: 78 },
        { ts: "2024-01-04", value: 85 },
        { ts: "2024-01-05", value: 86 },
        { ts: "2024-01-06", value: 87 },
        { ts: "2024-01-07", value: 88 },
    ],
    stability_delta: 10.0,
};

export const SAMPLE_PR_TESTOPS_DATA = {
    prId: "PR-1234",
    repoId: "frontend-web",
    pipelineStatus: {
        status: "success" as const,
        duration: "4m 12s",
    },
    testResults: {
        passed: 142,
        failed: 0,
        skipped: 3,
        flaky: 1,
    },
    coverageDelta: 0.4,
    releaseConfidence: 0.92,
};
