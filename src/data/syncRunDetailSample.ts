// ── Deterministic sync-run detail sample data for DEV_HEALTH_TEST_MODE ────────
//
// Mirrors the AI/TestOps sample-data convention: typed constants returned in
// test mode instead of hitting the admin API, so the run detail page renders a
// realistic, deterministic mix of unit states (success / failed / retrying)
// without a live backend. Values are CLEARLY SAMPLE — fixed dates, sample-*
// ids — and resolve source NAMES (never bare source ids) per the web DoD.

import type { SyncRun, SyncRunUnit, SyncRunUnitSummary } from "@/lib/admin/types";

const SAMPLE_RUN_ID = "sample-run-2703";
const SAMPLE_ORG_ID = "sample-org";
const SAMPLE_INTEGRATION_ID = "sample-integration";
const STARTED_AT = "2026-06-26T11:00:00.000Z";
const COMPLETED_AT = "2026-06-26T11:04:30.000Z";
const NEXT_RETRY_AT = "2026-06-26T11:10:00.000Z";

/** Sample SyncRun used by the detail page in test mode. */
export const SAMPLE_SYNC_RUN: SyncRun = {
    id: SAMPLE_RUN_ID,
    org_id: SAMPLE_ORG_ID,
    integration_id: SAMPLE_INTEGRATION_ID,
    triggered_by: "admin@devhealth.example",
    mode: "incremental",
    status: "partial_failed",
    total_units: 4,
    completed_units: 2,
    failed_units: 1,
    started_at: STARTED_AT,
    completed_at: COMPLETED_AT,
    result: { partial_failure_summary: { failed_datasets: ["prs"] } },
    error: null,
    created_at: STARTED_AT,
};

const SAMPLE_UNITS: SyncRunUnit[] = [
    {
        id: "sample-unit-aa11bb22",
        org_id: SAMPLE_ORG_ID,
        sync_run_id: SAMPLE_RUN_ID,
        integration_id: SAMPLE_INTEGRATION_ID,
        source_id: "sample-source-1",
        source_name: "platform-api",
        source_full_name: "fullchaos/platform-api",
        provider: "github",
        dataset_key: "git",
        cost_class: "standard",
        mode: "incremental",
        since_at: null,
        before_at: null,
        status: "success",
        attempts: 1,
        available_at: null,
        rate_limit_deferrals: 0,
        duration_seconds: 42,
        error: null,
        error_category: null,
        last_heartbeat_at: null,
        result: { items_synced: 318 },
        created_at: STARTED_AT,
        updated_at: COMPLETED_AT,
    },
    {
        id: "sample-unit-cc33dd44",
        org_id: SAMPLE_ORG_ID,
        sync_run_id: SAMPLE_RUN_ID,
        integration_id: SAMPLE_INTEGRATION_ID,
        source_id: "sample-source-1",
        source_name: "platform-api",
        source_full_name: "fullchaos/platform-api",
        provider: "github",
        dataset_key: "prs",
        cost_class: "expensive",
        mode: "incremental",
        since_at: null,
        before_at: null,
        status: "success",
        attempts: 1,
        available_at: null,
        rate_limit_deferrals: 1,
        duration_seconds: 156,
        error: null,
        error_category: null,
        last_heartbeat_at: null,
        result: { items_synced: 87 },
        created_at: STARTED_AT,
        updated_at: COMPLETED_AT,
    },
    {
        id: "sample-unit-ee55ff66",
        org_id: SAMPLE_ORG_ID,
        sync_run_id: SAMPLE_RUN_ID,
        integration_id: SAMPLE_INTEGRATION_ID,
        source_id: "sample-source-2",
        source_name: "billing-service",
        source_full_name: "fullchaos/billing-service",
        provider: "github",
        dataset_key: "prs",
        cost_class: "expensive",
        mode: "incremental",
        since_at: null,
        before_at: null,
        status: "failed",
        attempts: 3,
        available_at: null,
        rate_limit_deferrals: 0,
        duration_seconds: 12,
        error: "Upstream returned 500 while paginating pull requests",
        error_category: "provider_error",
        last_heartbeat_at: null,
        result: null,
        created_at: STARTED_AT,
        updated_at: COMPLETED_AT,
    },
    {
        id: "sample-unit-77aa88bb",
        org_id: SAMPLE_ORG_ID,
        sync_run_id: SAMPLE_RUN_ID,
        integration_id: SAMPLE_INTEGRATION_ID,
        source_id: "sample-source-2",
        source_name: "billing-service",
        source_full_name: "fullchaos/billing-service",
        provider: "github",
        dataset_key: "cicd",
        cost_class: "standard",
        mode: "incremental",
        since_at: null,
        before_at: null,
        status: "retrying",
        attempts: 2,
        available_at: NEXT_RETRY_AT,
        rate_limit_deferrals: 2,
        duration_seconds: null,
        error: "Secondary rate limit hit; backing off",
        error_category: "rate_limit",
        last_heartbeat_at: "2026-06-26T11:04:00.000Z",
        result: null,
        created_at: STARTED_AT,
        updated_at: COMPLETED_AT,
    },
];

/** Sample SyncRunUnitSummary used by the detail page in test mode. */
export const SAMPLE_SYNC_RUN_UNIT_SUMMARY: SyncRunUnitSummary = {
    by_status: { success: 2, failed: 1, retrying: 1 },
    by_source: {
        "sample-source-1": { success: 2 },
        "sample-source-2": { failed: 1, retrying: 1 },
    },
    by_dataset: {
        git: { success: 1 },
        prs: { success: 1, failed: 1 },
        cicd: { retrying: 1 },
    },
    by_cost_class: { standard: 2, expensive: 2 },
    slowest_unit_ids: ["sample-unit-cc33dd44"],
    failed_unit_ids: ["sample-unit-ee55ff66"],
    failed_unit_count: 1,
    unit_count: 4,
    partial_failure_summary: { failed_datasets: ["prs"] },
    next_retry_at: NEXT_RETRY_AT,
    units: SAMPLE_UNITS,
};
