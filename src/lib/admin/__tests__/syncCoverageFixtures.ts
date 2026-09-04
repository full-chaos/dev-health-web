import type { SyncCoverageSummary, SyncJob } from "../types";

const CONFIG_ID = "cfg-coverage";
const SOURCE_ID = "src-repo";
const RUN_ID = "run-coverage";
const GENERATED_AT = "2026-01-05T01:00:00Z";
const TRUNCATED_BEFORE = "2025-07-09T00:00:00Z";
const NEXT_RUN_AT = "2026-01-05T02:00:00Z";

const jan1Jan2 = {
    since: "2026-01-01T00:00:00Z",
    before: "2026-01-02T00:00:00Z",
    source_ids: [SOURCE_ID],
    run_ids: [RUN_ID],
};

const jan2Jan3 = {
    since: "2026-01-02T00:00:00Z",
    before: "2026-01-03T00:00:00Z",
    source_ids: [SOURCE_ID],
    run_ids: [RUN_ID],
};

const jan1Jan3 = {
    since: "2026-01-01T00:00:00Z",
    before: "2026-01-03T00:00:00Z",
    source_ids: [SOURCE_ID],
    run_ids: [RUN_ID],
};

const baseSummary = {
    config_id: CONFIG_ID,
    provider: "github",
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 3650,
    truncated_before: TRUNCATED_BEFORE,
} satisfies Pick<
    SyncCoverageSummary,
    | "config_id"
    | "provider"
    | "generated_at"
    | "data_basis"
    | "history_lookback_days"
    | "truncated_before"
>;

export const EMPTY_COVERAGE_SUMMARY = {
    ...baseSummary,
    overall: {
        health: "insufficient_data",
        latest_successful_run_at: null,
        latest_covered_through: null,
        next_scheduled_run_at: NEXT_RUN_AT,
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [],
    sources: [],
} satisfies SyncCoverageSummary;

export const COMPLETE_COVERAGE_SUMMARY = {
    ...baseSummary,
    overall: {
        health: "healthy",
        latest_successful_run_at: "2026-01-02T00:00:00Z",
        latest_covered_through: "2026-01-02T00:00:00Z",
        next_scheduled_run_at: NEXT_RUN_AT,
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "commits",
            status: "healthy",
            covered_through: "2026-01-02T00:00:00Z",
            requested_ranges: [jan1Jan2],
            covered_ranges: [jan1Jan2],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_ID,
            source_name: "acme/repo",
            status: "healthy",
            covered_through: "2026-01-02T00:00:00Z",
            gap_count: 0,
            failed_range_count: 0,
        },
    ],
} satisfies SyncCoverageSummary;

export const PARTIAL_COVERAGE_SUMMARY = {
    ...baseSummary,
    overall: {
        health: "gaps",
        latest_successful_run_at: "2026-01-02T00:00:00Z",
        latest_covered_through: "2026-01-02T00:00:00Z",
        next_scheduled_run_at: NEXT_RUN_AT,
        gap_count: 1,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "commits",
            status: "gaps",
            covered_through: "2026-01-02T00:00:00Z",
            requested_ranges: [jan1Jan3],
            covered_ranges: [jan1Jan2],
            gaps: [jan2Jan3],
            stale_ranges: [],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_ID,
            source_name: "acme/repo",
            status: "gaps",
            covered_through: "2026-01-02T00:00:00Z",
            gap_count: 1,
            failed_range_count: 0,
        },
    ],
} satisfies SyncCoverageSummary;

export const TRUNCATED_COVERAGE_SUMMARY = {
    ...PARTIAL_COVERAGE_SUMMARY,
    coverage_since: "2025-12-20T00:00:00Z",
    coverage_through: GENERATED_AT,
    is_truncated: true,
    truncation_reason: "lookback_limit",
    backfill_windows: [
        {
            since: "2025-12-20",
            before: "2026-01-01",
        },
    ],
} satisfies SyncCoverageSummary;

export const FAILED_COVERAGE_SUMMARY = {
    ...baseSummary,
    overall: {
        health: "failed",
        latest_successful_run_at: "2026-01-02T00:00:00Z",
        latest_covered_through: "2026-01-02T00:00:00Z",
        next_scheduled_run_at: NEXT_RUN_AT,
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 1,
    },
    datasets: [
        {
            dataset_key: "commits",
            status: "failed",
            covered_through: "2026-01-02T00:00:00Z",
            requested_ranges: [jan1Jan3],
            covered_ranges: [jan1Jan2],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [jan2Jan3],
        },
    ],
    sources: [
        {
            source_id: SOURCE_ID,
            source_name: "acme/repo",
            status: "failed",
            covered_through: "2026-01-02T00:00:00Z",
            gap_count: 0,
            failed_range_count: 1,
        },
    ],
} satisfies SyncCoverageSummary;

export const LEGACY_INSUFFICIENT_DATA_SUMMARY = {
    ...baseSummary,
    data_basis: "legacy",
    overall: {
        health: "insufficient_data",
        latest_successful_run_at: null,
        latest_covered_through: null,
        next_scheduled_run_at: null,
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "commits",
            status: "insufficient_data",
            covered_through: null,
            requested_ranges: [],
            covered_ranges: [],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_ID,
            source_name: "acme/repo",
            status: "insufficient_data",
            covered_through: null,
            gap_count: 0,
            failed_range_count: 0,
        },
    ],
} satisfies SyncCoverageSummary;

export const COVERAGE_SUMMARIES = {
    empty: EMPTY_COVERAGE_SUMMARY,
    complete: COMPLETE_COVERAGE_SUMMARY,
    partial: PARTIAL_COVERAGE_SUMMARY,
    truncated: TRUNCATED_COVERAGE_SUMMARY,
    failed: FAILED_COVERAGE_SUMMARY,
    legacy: LEGACY_INSUFFICIENT_DATA_SUMMARY,
} satisfies Record<string, SyncCoverageSummary>;

export const SYNC_JOB_WITH_RUN = {
    id: "job-run-1",
    job_id: "job-1",
    status: "success",
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-02T00:00:00Z",
    duration_seconds: 86_400,
    items_synced: 42,
    result: { synced: 42 },
    error: null,
    triggered_by: "manual",
    sync_run: {
        mode: "incremental",
        triggered_by: "manual",
        requested_range: jan1Jan3,
        covered_range: jan1Jan2,
        total_units: 2,
        completed_units: 1,
        failed_units: 1,
        sync_run_id: RUN_ID,
    },
    created_at: "2026-01-01T00:00:00Z",
} satisfies SyncJob;
