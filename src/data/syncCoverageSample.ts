// ── Deterministic sync-coverage sample data for DEV_HEALTH_TEST_MODE ─────────
//
// Mirrors the run-detail sample-data convention (data/syncRunDetailSample.ts):
// typed constants rendered in test mode instead of hitting the admin API, so
// the coverage-first config detail page (CHAOS-2791/2792/2793) is exercisable
// in Playwright/unit tests without a live backend. Values are CLEARLY SAMPLE
// (fixed dates, sample-* ids) and resolve source NAMES (never bare source
// ids) per the web DoD. Scenario shapes intentionally mirror the frozen
// contract fixtures in lib/admin/__tests__/syncCoverageFixtures.ts (CHAOS-2790)
// so sample-mode rendering and the API contract never drift apart.

import type {
    BackfillJob,
    SyncConfig,
    SyncCoverageRange,
    SyncCoverageSummary,
    SyncJob,
} from "@/lib/admin/types";

const CONFIG_ID = "sample-sync-config";
const PROVIDER = "github";
const SOURCE_PLATFORM = "sample-source-platform-api";
const SOURCE_BILLING = "sample-source-billing-service";
const RUN_HEALTHY = "sample-run-healthy";
const RUN_GAPS = "sample-run-gaps";
const RUN_FAILED = "sample-run-failed";
const RUN_STALE = "sample-run-stale";
const RUN_RETRY = "sample-run-retry";
const RUN_CONCURRENT = "sample-run-concurrent";
const SOURCE_SECONDARY = "sample-source-secondary-repo";
const CONFIG_ID_SECONDARY = "sample-sync-config-secondary";

const GENERATED_AT = "2026-07-02T15:00:00.000Z";
const TRUNCATED_BEFORE = "2026-01-03T00:00:00.000Z";

function range(
    since: string,
    before: string,
    sourceIds: string[],
    runIds: string[] = [],
): SyncCoverageRange {
    return { since, before, source_ids: sourceIds, run_ids: runIds };
}

/** Sample sync config matching the coverage/job samples below (test-mode only). */
export const SAMPLE_SYNC_CONFIG: SyncConfig = {
    id: CONFIG_ID,
    name: "fullchaos/platform-api (sample)",
    provider: PROVIDER,
    credential_id: "sample-credential",
    sync_targets: ["git", "prs", "cicd", "work-items"],
    sync_options: {},
    is_active: true,
    schedule_cron: "0 * * * *",
    timezone: "UTC",
    initial_sync_depth: 90,
    last_sync_at: "2026-07-02T13:00:00.000Z",
    last_sync_success: true,
    last_sync_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-07-02T13:00:00.000Z",
    parent_id: null,
};

// ---- Coverage summary scenarios ----

export const SAMPLE_COVERAGE_HEALTHY: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "healthy",
        latest_successful_run_at: "2026-07-02T13:00:00.000Z",
        latest_covered_through: "2026-07-02T13:00:00.000Z",
        next_scheduled_run_at: "2026-07-02T14:00:00.000Z",
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "git",
            status: "healthy",
            covered_through: "2026-07-02T13:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T13:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_HEALTHY],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T13:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_HEALTHY],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [],
        },
        {
            dataset_key: "prs",
            status: "healthy",
            covered_through: "2026-07-02T13:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T13:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_HEALTHY],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T13:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_HEALTHY],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_PLATFORM,
            source_name: "fullchaos/platform-api",
            status: "healthy",
            covered_through: "2026-07-02T13:00:00.000Z",
            gap_count: 0,
            failed_range_count: 0,
        },
    ],
};

export const SAMPLE_COVERAGE_GAPS: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "gaps",
        latest_successful_run_at: "2026-07-01T09:00:00.000Z",
        latest_covered_through: "2026-06-28T00:00:00.000Z",
        next_scheduled_run_at: "2026-07-02T16:00:00.000Z",
        gap_count: 2,
        stale_dataset_count: 1,
        failed_range_count: 1,
    },
    datasets: [
        {
            dataset_key: "git",
            status: "gaps",
            covered_through: "2026-06-28T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-07-01T09:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_GAPS],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-06-24T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_GAPS],
                ),
                range(
                    "2026-06-26T00:00:00.000Z",
                    "2026-06-28T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_GAPS],
                ),
            ],
            gaps: [
                range("2026-06-24T00:00:00.000Z", "2026-06-26T00:00:00.000Z", [SOURCE_PLATFORM]),
                range("2026-06-28T00:00:00.000Z", "2026-07-01T09:00:00.000Z", [SOURCE_PLATFORM]),
            ],
            stale_ranges: [],
            failed_ranges: [],
        },
        {
            dataset_key: "prs",
            status: "failed",
            covered_through: "2026-06-25T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-07-01T09:00:00.000Z",
                    [SOURCE_PLATFORM, SOURCE_BILLING],
                    [RUN_GAPS],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-06-25T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_GAPS],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [
                range(
                    "2026-06-25T00:00:00.000Z",
                    "2026-06-27T00:00:00.000Z",
                    [SOURCE_BILLING],
                    [RUN_GAPS],
                ),
            ],
        },
        {
            dataset_key: "cicd",
            status: "stale",
            covered_through: "2026-06-15T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-06-15T00:00:00.000Z",
                    [SOURCE_BILLING],
                    [RUN_GAPS],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-06-15T00:00:00.000Z",
                    [SOURCE_BILLING],
                    [RUN_GAPS],
                ),
            ],
            gaps: [],
            stale_ranges: [
                range("2026-06-15T00:00:00.000Z", "2026-07-02T15:00:00.000Z", [SOURCE_BILLING]),
            ],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_PLATFORM,
            source_name: "fullchaos/platform-api",
            status: "gaps",
            covered_through: "2026-06-28T00:00:00.000Z",
            gap_count: 2,
            failed_range_count: 0,
        },
        {
            source_id: SOURCE_BILLING,
            source_name: "fullchaos/billing-service",
            status: "failed",
            covered_through: "2026-06-25T00:00:00.000Z",
            gap_count: 0,
            failed_range_count: 1,
        },
    ],
};

export const SAMPLE_COVERAGE_FAILED: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "failed",
        latest_successful_run_at: "2026-06-20T00:00:00.000Z",
        latest_covered_through: "2026-06-20T00:00:00.000Z",
        next_scheduled_run_at: "2026-07-02T16:00:00.000Z",
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 1,
    },
    datasets: [
        {
            dataset_key: "work-items",
            status: "failed",
            covered_through: "2026-06-20T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-07-02T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_FAILED],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-18T00:00:00.000Z",
                    "2026-06-20T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_FAILED],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-07-02T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_FAILED],
                ),
            ],
        },
    ],
    sources: [
        {
            source_id: SOURCE_PLATFORM,
            source_name: "fullchaos/platform-api",
            status: "failed",
            covered_through: "2026-06-20T00:00:00.000Z",
            gap_count: 0,
            failed_range_count: 1,
        },
    ],
};

export const SAMPLE_COVERAGE_STALE: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "stale",
        latest_successful_run_at: "2026-06-10T00:00:00.000Z",
        latest_covered_through: "2026-06-10T00:00:00.000Z",
        next_scheduled_run_at: null,
        gap_count: 0,
        stale_dataset_count: 2,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "git",
            status: "stale",
            covered_through: "2026-06-10T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-05-01T00:00:00.000Z",
                    "2026-06-10T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_STALE],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-05-01T00:00:00.000Z",
                    "2026-06-10T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_STALE],
                ),
            ],
            gaps: [],
            stale_ranges: [
                range("2026-06-10T00:00:00.000Z", "2026-07-02T15:00:00.000Z", [SOURCE_PLATFORM]),
            ],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_PLATFORM,
            source_name: "fullchaos/platform-api",
            status: "stale",
            covered_through: "2026-06-10T00:00:00.000Z",
            gap_count: 0,
            failed_range_count: 0,
        },
    ],
};

export const SAMPLE_COVERAGE_INSUFFICIENT_DATA: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "legacy",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "insufficient_data",
        latest_successful_run_at: null,
        latest_covered_through: null,
        next_scheduled_run_at: null,
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [],
    sources: [],
};

export const SAMPLE_COVERAGE_OVERLAPPING_RETRY: SyncCoverageSummary = {
    config_id: CONFIG_ID,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "healthy",
        latest_successful_run_at: "2026-06-27T00:00:00.000Z",
        latest_covered_through: "2026-06-27T00:00:00.000Z",
        next_scheduled_run_at: "2026-07-02T16:00:00.000Z",
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 1,
    },
    datasets: [
        {
            dataset_key: "git",
            status: "healthy",
            covered_through: "2026-06-27T00:00:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-06-27T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_FAILED, RUN_RETRY],
                ),
            ],
            covered_ranges: [
                // A successful retry (RUN_RETRY) re-covers and extends past
                // the window an earlier run (RUN_FAILED) failed on — the
                // failed and covered ranges below deliberately OVERLAP
                // (CHAOS-2791 D3: "overlapping-retry" scenario).
                range(
                    "2026-06-22T00:00:00.000Z",
                    "2026-06-27T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_RETRY],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [
                range(
                    "2026-06-20T00:00:00.000Z",
                    "2026-06-24T00:00:00.000Z",
                    [SOURCE_PLATFORM],
                    [RUN_FAILED],
                ),
            ],
        },
    ],
    sources: [
        {
            source_id: SOURCE_PLATFORM,
            source_name: "fullchaos/platform-api",
            status: "healthy",
            covered_through: "2026-06-27T00:00:00.000Z",
            gap_count: 0,
            failed_range_count: 1,
        },
    ],
};

/**
 * Second GitHub config's coverage (CHAOS-2791 D3: "concurrent same-provider
 * configs"). Demonstrates that coverage summaries are scoped per config_id
 * even when two configs share a provider — a distinct config_id/source pair
 * from the primary sample config above.
 */
export const SAMPLE_COVERAGE_CONCURRENT_CONFIG: SyncCoverageSummary = {
    config_id: CONFIG_ID_SECONDARY,
    provider: PROVIDER,
    generated_at: GENERATED_AT,
    data_basis: "planner",
    history_lookback_days: 180,
    truncated_before: TRUNCATED_BEFORE,
    overall: {
        health: "healthy",
        latest_successful_run_at: "2026-07-02T12:30:00.000Z",
        latest_covered_through: "2026-07-02T12:30:00.000Z",
        next_scheduled_run_at: "2026-07-02T13:30:00.000Z",
        gap_count: 0,
        stale_dataset_count: 0,
        failed_range_count: 0,
    },
    datasets: [
        {
            dataset_key: "git",
            status: "healthy",
            covered_through: "2026-07-02T12:30:00.000Z",
            requested_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T12:30:00.000Z",
                    [SOURCE_SECONDARY],
                    [RUN_CONCURRENT],
                ),
            ],
            covered_ranges: [
                range(
                    "2026-06-01T00:00:00.000Z",
                    "2026-07-02T12:30:00.000Z",
                    [SOURCE_SECONDARY],
                    [RUN_CONCURRENT],
                ),
            ],
            gaps: [],
            stale_ranges: [],
            failed_ranges: [],
        },
    ],
    sources: [
        {
            source_id: SOURCE_SECONDARY,
            source_name: "fullchaos/second-repo",
            status: "healthy",
            covered_through: "2026-07-02T12:30:00.000Z",
            gap_count: 0,
            failed_range_count: 0,
        },
    ],
};

/** Named scenarios selectable via the `?coverage_scenario=` test-mode query param. */
export const SYNC_COVERAGE_SAMPLES = {
    healthy: SAMPLE_COVERAGE_HEALTHY,
    gaps: SAMPLE_COVERAGE_GAPS,
    failed: SAMPLE_COVERAGE_FAILED,
    stale: SAMPLE_COVERAGE_STALE,
    insufficient_data: SAMPLE_COVERAGE_INSUFFICIENT_DATA,
    overlapping_retry: SAMPLE_COVERAGE_OVERLAPPING_RETRY,
    concurrent_config: SAMPLE_COVERAGE_CONCURRENT_CONFIG,
} satisfies Record<string, SyncCoverageSummary>;

export type SyncCoverageSampleScenario = keyof typeof SYNC_COVERAGE_SAMPLES;

export const DEFAULT_SYNC_COVERAGE_SCENARIO: SyncCoverageSampleScenario = "gaps";

export function resolveSyncCoverageSampleScenario(
    value: string | undefined,
): SyncCoverageSampleScenario {
    if (value && Object.hasOwn(SYNC_COVERAGE_SAMPLES, value)) {
        return value as SyncCoverageSampleScenario;
    }
    return DEFAULT_SYNC_COVERAGE_SCENARIO;
}

// ---- Job history sample (mix of planner-enriched + legacy rows) ----

function jobRange(since: string, before: string, sourceIds: string[]): SyncCoverageRange {
    return { since, before, source_ids: sourceIds, run_ids: [] };
}

export const SAMPLE_SYNC_JOBS: SyncJob[] = [
    {
        id: "sample-job-1",
        job_id: "sample-job-1",
        status: "success",
        started_at: "2026-07-02T13:00:00.000Z",
        completed_at: "2026-07-02T13:04:00.000Z",
        duration_seconds: 240,
        items_synced: 412,
        triggered_by: "scheduled",
        created_at: "2026-07-02T13:00:00.000Z",
        sync_run: {
            mode: "incremental",
            triggered_by: "scheduled",
            requested_range: jobRange("2026-07-02T12:00:00.000Z", "2026-07-02T13:00:00.000Z", [
                SOURCE_PLATFORM,
            ]),
            covered_range: jobRange("2026-07-02T12:00:00.000Z", "2026-07-02T13:00:00.000Z", [
                SOURCE_PLATFORM,
            ]),
            total_units: 4,
            completed_units: 4,
            failed_units: 0,
            sync_run_id: RUN_HEALTHY,
        },
    },
    {
        id: "sample-job-2",
        job_id: "sample-job-2",
        status: "success",
        started_at: "2026-07-01T09:00:00.000Z",
        completed_at: "2026-07-01T09:06:12.000Z",
        duration_seconds: 372,
        items_synced: 88,
        triggered_by: "manual",
        created_at: "2026-07-01T09:00:00.000Z",
        sync_run: {
            mode: "incremental",
            triggered_by: "admin@devhealth.example",
            requested_range: jobRange("2026-06-20T00:00:00.000Z", "2026-07-01T09:00:00.000Z", [
                SOURCE_PLATFORM,
                SOURCE_BILLING,
            ]),
            covered_range: jobRange("2026-06-20T00:00:00.000Z", "2026-06-28T00:00:00.000Z", [
                SOURCE_PLATFORM,
                SOURCE_BILLING,
            ]),
            total_units: 6,
            completed_units: 4,
            failed_units: 1,
            sync_run_id: RUN_GAPS,
        },
    },
    {
        id: "sample-job-3",
        job_id: "sample-job-3",
        status: "failed",
        started_at: "2026-06-20T00:00:00.000Z",
        completed_at: "2026-06-20T00:03:40.000Z",
        duration_seconds: 220,
        items_synced: 0,
        error: "Upstream returned 500 while paginating work items",
        triggered_by: "scheduled",
        created_at: "2026-06-20T00:00:00.000Z",
        sync_run: {
            mode: "full_resync",
            triggered_by: "scheduled",
            requested_range: jobRange("2026-06-20T00:00:00.000Z", "2026-07-02T00:00:00.000Z", [
                SOURCE_PLATFORM,
            ]),
            covered_range: null,
            total_units: 3,
            completed_units: 0,
            failed_units: 3,
            sync_run_id: RUN_FAILED,
        },
    },
    {
        id: "sample-job-4",
        job_id: "sample-job-4",
        status: "success",
        started_at: "2026-06-10T00:00:00.000Z",
        completed_at: "2026-06-10T00:05:00.000Z",
        duration_seconds: 300,
        items_synced: 210,
        triggered_by: "scheduled",
        created_at: "2026-06-10T00:00:00.000Z",
        sync_run: {
            mode: "incremental",
            triggered_by: "scheduled",
            requested_range: jobRange("2026-05-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z", [
                SOURCE_PLATFORM,
            ]),
            covered_range: jobRange("2026-05-01T00:00:00.000Z", "2026-06-10T00:00:00.000Z", [
                SOURCE_PLATFORM,
            ]),
            total_units: 2,
            completed_units: 2,
            failed_units: 0,
            sync_run_id: RUN_STALE,
        },
    },
    // Legacy rows: no planner sync_run enrichment block. Must render readable
    // with em-dashes, never fabricate a complete/partial/gap/failed label.
    {
        id: "sample-job-legacy-1",
        job_id: "sample-job-legacy-1",
        status: "success",
        started_at: "2026-05-15T00:00:00.000Z",
        completed_at: "2026-05-15T00:02:30.000Z",
        duration_seconds: 150,
        items_synced: 63,
        triggered_by: "scheduled",
        created_at: "2026-05-15T00:00:00.000Z",
        result: { dataset_key: "work-items" },
    },
    {
        id: "sample-job-legacy-2",
        job_id: "sample-job-legacy-2",
        status: "failed",
        started_at: "2026-05-01T00:00:00.000Z",
        completed_at: "2026-05-01T00:01:10.000Z",
        duration_seconds: 70,
        items_synced: 0,
        error: "Credential expired",
        triggered_by: "scheduled",
        created_at: "2026-05-01T00:00:00.000Z",
    },
];

// ---- Active backfill job sample (BackfillStatus, CHAOS-2795) ----

/** Sample in-progress backfill job, selectable via `?backfill_scenario=running`. */
export const SAMPLE_ACTIVE_BACKFILL_JOB: BackfillJob = {
    id: "sample-backfill-job-running",
    sync_config_id: CONFIG_ID,
    status: "running",
    since_date: "2026-06-20",
    before_date: "2026-06-26",
    total_chunks: 6,
    completed_chunks: 3,
    failed_chunks: 0,
    progress_pct: 50,
    error_message: null,
    started_at: "2026-07-02T15:05:00.000Z",
    completed_at: null,
    created_at: "2026-07-02T15:00:00.000Z",
    updated_at: "2026-07-02T15:05:00.000Z",
};

/** Named scenarios selectable via the `?backfill_scenario=` test-mode query param. */
export const SAMPLE_BACKFILL_JOBS = {
    none: null,
    running: SAMPLE_ACTIVE_BACKFILL_JOB,
} satisfies Record<string, BackfillJob | null>;

export type SampleBackfillScenario = keyof typeof SAMPLE_BACKFILL_JOBS;

export const DEFAULT_BACKFILL_SCENARIO: SampleBackfillScenario = "none";

export function resolveSampleBackfillScenario(value: string | undefined): SampleBackfillScenario {
    if (value && Object.hasOwn(SAMPLE_BACKFILL_JOBS, value)) {
        return value as SampleBackfillScenario;
    }
    return DEFAULT_BACKFILL_SCENARIO;
}
