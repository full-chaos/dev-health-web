/**
 * Admin API Types
 *
 * TypeScript interfaces matching dev-health-ops/api/admin/schemas.py
 */

// ---- Settings ----

export interface Setting {
    key: string;
    value: string | null;
    category: string;
    is_encrypted: boolean;
    description: string | null;
}

export interface SettingCreate {
    key: string;
    value?: string | null;
    category?: string;
    encrypt?: boolean;
    description?: string | null;
}

export interface SettingUpdate {
    value?: string | null;
    encrypt?: boolean;
    description?: string | null;
}

export interface SettingsListResponse {
    category: string;
    settings: Setting[];
}

// ---- Integration Credentials ----

export interface IntegrationCredential {
    id: string;
    provider: string;
    name: string;
    is_active: boolean;
    config: Record<string, unknown>;
    last_test_at: string | null;
    last_test_success: boolean | null;
    last_test_error: string | null;
    created_at: string;
    updated_at: string;
}

export interface IntegrationCredentialCreate {
    provider: string;
    name?: string;
    credentials: Record<string, unknown>;
    config?: Record<string, unknown> | null;
}

export interface IntegrationCredentialUpdate {
    credentials?: Record<string, unknown> | null;
    config?: Record<string, unknown> | null;
    is_active?: boolean | null;
}

export interface TestConnectionRequest {
    provider: string;
    name?: string;
    credentials?: Record<string, unknown>;
}

export interface TestConnectionResponse {
    success: boolean;
    error: string | null;
    details: Record<string, unknown> | null;
}

// ---- Sync Configs ----

export interface SyncConfig {
    id: string;
    name: string;
    provider: string;
    credential_id: string | null;
    sync_targets: string[];
    sync_options: Record<string, unknown>;
    is_active: boolean;
    schedule_cron: string | null;
    timezone: string | null;
    initial_sync_depth?: number | null;
    last_sync_at: string | null;
    last_sync_success: boolean | null;
    last_sync_error: string | null;
    created_at: string;
    updated_at: string;
    parent_id: string | null;
}

// ---- Discovered Repos ----

export interface DiscoveredRepo {
    name: string;
    full_name: string;
    description: string | null;
    is_private: boolean;
    is_archived: boolean;
    default_branch: string | null;
    language: string | null;
    stargazers_count: number | null;
    forks_count: number | null;
    updated_at: string | null;
}

export interface DiscoveredReposResponse {
    provider: string;
    owner: string;
    repos: DiscoveredRepo[];
    total: number;
}

// ---- Batch Sync Config Create ----

export interface SyncConfigBatchCreate extends SyncConfigCreate {
    repos: string[];
}

export interface SyncConfigBatchResponse {
    created: SyncConfig[];
    parent: SyncConfig;
    count: number;
}

export interface SyncConfigRepositorySelection {
    owner: string;
    repos: string[];
    sync_all_repos: boolean;
}

export interface SyncConfigRepositorySelectionUpdate {
    owner: string;
    repos: string[];
}

export interface SyncJob {
    id: string;
    config_id?: string;
    job_id?: string;
    status: "pending" | "running" | "success" | "failed" | "cancelled";
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number | null;
    items_synced: number;
    result?: Record<string, unknown> | null;
    error?: string | null;
    triggered_by?: string;
    created_at?: string;
}

/**
 * Response union returned by POST /sync-configs/{id}/trigger.
 *
 * The backend routes a manual trigger down one of two paths and the JSON
 * shape differs by path (see dev-health-ops api/admin/routers/sync.py):
 *   - planner / fan-out runs return `sync_run_id` (poll GET /sync-runs/{id})
 *   - legacy ScheduledJob/JobRun runs return `run_id` + `task_id`
 *       (poll the legacy /sync-configs/{id}/jobs path)
 * `status` is always present ("triggered"); the id fields are mutually
 * exclusive depending on the path taken.
 */
export interface SyncTriggerResult {
    status?: string;
    config_id?: string;
    // Planner / fan-out branch
    sync_run_id?: string;
    total_units?: number;
    // Legacy ScheduledJob/JobRun branch
    task_id?: string;
    run_id?: string;
}

/**
 * Planner sync run status, returned by GET /sync-runs/{run_id}.
 * Mirrors dev-health-ops api/admin/schemas/integrations.py:SyncRunResponse.
 * `status` is one of planned|dispatching|running|success|failed.
 */
export interface SyncRun {
    id: string;
    org_id: string;
    integration_id: string;
    triggered_by: string;
    mode: string;
    status: string;
    total_units: number;
    completed_units: number;
    failed_units: number;
    started_at: string | null;
    completed_at: string | null;
    result: Record<string, unknown> | null;
    error: string | null;
    created_at: string;
}

/**
 * A single unit of work within a planner sync run, returned inside
 * SyncRunUnitSummary by GET /sync-runs/{run_id}/units. Mirrors
 * dev-health-ops api/admin/schemas/integrations.py:SyncRunUnitResponse.
 *
 * Render-only: `source_full_name` / `source_name` are the resolved labels;
 * never surface the raw `source_id` when a name exists.
 */
export interface SyncRunUnit {
    id: string;
    org_id: string;
    sync_run_id: string;
    integration_id: string;
    source_id: string;
    /** Resolved short source/repo name, or null when unresolved. */
    source_name: string | null;
    /** Resolved fully-qualified source name (e.g. org/repo), or null. */
    source_full_name: string | null;
    provider: string;
    dataset_key: string;
    cost_class: string;
    mode: string;
    since_at: string | null;
    before_at: string | null;
    status: string;
    attempts: number;
    /** Earliest retry timestamp for a retrying unit, else null. */
    available_at: string | null;
    rate_limit_deferrals: number;
    duration_seconds: number | null;
    error: string | null;
    /** Extracted failure category (e.g. rate_limit), or null. */
    error_category: string | null;
    last_heartbeat_at: string | null;
    result: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

/**
 * Aggregate unit-level progress for a planner sync run, returned by
 * GET /sync-runs/{run_id}/units. Mirrors
 * dev-health-ops api/admin/schemas/integrations.py:SyncRunUnitSummary.
 *
 * Rollups are persisted backend state; the UI groups/displays them but never
 * recomputes categories or source-of-truth.
 */
export interface SyncRunUnitSummary {
    by_status: Record<string, number>;
    by_source: Record<string, Record<string, number>>;
    by_dataset: Record<string, Record<string, number>>;
    by_cost_class: Record<string, number>;
    slowest_unit_ids: string[];
    failed_unit_ids: string[];
    failed_unit_count: number;
    unit_count: number;
    partial_failure_summary: Record<string, unknown> | null;
    /** Earliest available_at among retrying units, else null. */
    next_retry_at: string | null;
    units: SyncRunUnit[];
}

export interface SyncConfigCreate {
    name: string;
    provider: string;
    credential_id?: string | null;
    sync_targets?: string[];
    sync_options?: Record<string, unknown>;
    schedule_cron?: string | null;
    timezone?: string | null;
    initial_sync_depth?: number | null;
}

export interface BackfillRequest {
    since: string;
    before: string;
}

export interface BackfillResponse {
    task_id: string;
    status: string;
    backfill_job_id: string;
}

export interface BackfillJob {
    id: string;
    sync_config_id: string;
    status: string;
    since_date: string;
    before_date: string;
    total_chunks: number;
    completed_chunks: number;
    failed_chunks: number;
    progress_pct: number;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

export interface SyncConfigUpdate {
    sync_targets?: string[] | null;
    sync_options?: Record<string, unknown> | null;
    is_active?: boolean | null;
    schedule_cron?: string | null;
    timezone?: string | null;
    initial_sync_depth?: number | null;
}

// ---- Identity Mappings ----

export interface IdentityMapping {
    id: string;
    canonical_id: string;
    display_name: string | null;
    email: string | null;
    provider_identities: Record<string, string[]>;
    team_ids: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface IdentityMappingCreate {
    canonical_id: string;
    display_name?: string | null;
    email?: string | null;
    provider_identities?: Record<string, string[]>;
    team_ids?: string[];
}

export interface IdentityMappingUpdate {
    display_name?: string | null;
    email?: string | null;
    provider_identities?: Record<string, string[]> | null;
    team_ids?: string[] | null;
}

// ---- Team Mappings ----

export interface TeamMapping {
    id: string;
    team_id: string;
    name: string;
    description: string | null;
    repo_patterns: string[];
    project_keys: string[];
    extra_data: Record<string, unknown>;
    managed_fields: string[];
    sync_policy: number;
    flagged_changes: Record<string, unknown> | null;
    last_drift_sync_at: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TeamMappingCreate {
    team_id: string;
    name: string;
    description?: string | null;
    repo_patterns?: string[];
    project_keys?: string[];
    extra_data?: Record<string, unknown>;
    managed_fields?: string[];
    sync_policy?: number;
}

export interface TeamMappingUpdate {
    name?: string | null;
    description?: string | null;
    repo_patterns?: string[] | null;
    project_keys?: string[] | null;
    extra_data?: Record<string, unknown> | null;
    managed_fields?: string[] | null;
    sync_policy?: number | null;
}

export interface DiscoveredTeam {
    provider_type: string;
    provider_team_id: string;
    name: string;
    description?: string | null;
    member_count?: number | null;
    associations: Record<string, unknown>;
}

export interface TeamDiscoverResponse {
    provider: string;
    teams: DiscoveredTeam[];
    total: number;
}

export interface TeamImportRequest {
    teams: DiscoveredTeam[];
    on_conflict: "skip" | "merge";
}

export interface TeamImportResponse {
    imported: number;
    skipped: number;
    merged: number;
    details: Array<Record<string, unknown>>;
}

export interface FlaggedChange {
    change_id: string;
    team_id: string;
    team_name: string;
    change_type: "field_changed" | "provider_removed" | "new_team_available";
    field?: string | null;
    old_value?: unknown;
    new_value?: unknown;
    discovered_at: string;
    change_index: number;
}

export interface PendingChangesResponse {
    changes: FlaggedChange[];
    total: number;
}

// ---- Users ----

export interface User {
    id: string;
    email: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    auth_provider: string;
    is_active: boolean;
    is_verified: boolean;
    is_superuser: boolean;
    role?: string;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface UserCreate {
    email: string;
    password?: string | null;
    username?: string | null;
    full_name?: string | null;
    auth_provider?: string;
    auth_provider_id?: string | null;
    is_verified?: boolean;
    is_superuser?: boolean;
}

export interface UserUpdate {
    email?: string | null;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    is_active?: boolean | null;
    is_verified?: boolean | null;
    is_superuser?: boolean | null;
}

export interface UserSetPassword {
    password: string;
}

// ---- Organizations ----

export interface Organization {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    tier: string;
    settings: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface OrganizationCreate {
    name: string;
    slug?: string | null;
    description?: string | null;
    tier?: string;
    settings?: Record<string, unknown>;
    owner_user_id?: string | null;
}

export interface OrganizationUpdate {
    name?: string | null;
    description?: string | null;
    tier?: string | null;
    settings?: Record<string, unknown> | null;
    is_active?: boolean | null;
}

// ---- Memberships ----

export interface Membership {
    id: string;
    org_id: string;
    user_id: string;
    role: string;
    invited_by_id: string | null;
    joined_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface MembershipCreate {
    user_id: string;
    role?: string;
    invited_by_id?: string | null;
}

export interface MembershipUpdateRole {
    role: string;
}

export interface OwnershipTransfer {
    new_owner_user_id: string;
}

// ---- Audit Logs ----

export interface AuditLog {
    id: string;
    org_id: string;
    user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    description: string | null;
    changes: Record<string, unknown> | null;
    request_metadata: Record<string, unknown> | null;
    status: string;
    error_message: string | null;
    created_at: string;
}

export interface AuditLogListResponse {
    items: AuditLog[];
    total: number;
    limit: number;
    offset: number;
}

export interface AuditLogFilter {
    user_id?: string | null;
    action?: string | null;
    resource_type?: string | null;
    resource_id?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
}

// ---- IP Allowlist ----

export interface IPAllowlist {
    id: string;
    org_id: string;
    ip_range: string;
    description: string | null;
    is_active: boolean;
    created_by_id: string | null;
    created_at: string;
    updated_at: string;
    expires_at: string | null;
}

export interface IPAllowlistCreate {
    ip_range: string;
    description?: string | null;
    expires_at?: string | null;
}

export interface IPAllowlistUpdate {
    ip_range?: string | null;
    description?: string | null;
    is_active?: boolean | null;
    expires_at?: string | null;
}

export interface IPAllowlistListResponse {
    items: IPAllowlist[];
    total: number;
    limit: number;
    offset: number;
}

export interface IPCheckResponse {
    allowed: boolean;
    ip_address: string;
}

// ---- Retention Policies ----

export interface RetentionPolicy {
    id: string;
    org_id: string;
    resource_type: string;
    retention_days: number;
    description: string | null;
    is_active: boolean;
    last_run_at: string | null;
    last_run_deleted_count: number | null;
    next_run_at: string | null;
    created_by_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface RetentionPolicyCreate {
    resource_type: string;
    retention_days?: number;
    description?: string | null;
}

export interface RetentionPolicyUpdate {
    retention_days?: number | null;
    description?: string | null;
    is_active?: boolean | null;
}

export interface RetentionPolicyListResponse {
    items: RetentionPolicy[];
    total: number;
    limit: number;
    offset: number;
}

export interface RetentionExecuteResponse {
    deleted_count: number;
    error: string | null;
}

// ---- BYO LLM Settings ----

/** Providers selectable for Bring-Your-Own-LLM. Mirrors the backend-supported set. */
export type LLMProvider = "openai" | "anthropic" | "gemini" | "qwen";

export const LLM_PROVIDERS: LLMProvider[] = ["openai", "anthropic", "gemini", "qwen"];

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    qwen: "Qwen",
};

/**
 * GET /admin/llm-settings response. The api_key is write-only server-side and is
 * returned masked (never the real key). Null/absent fields are omitted by the
 * backend (response_model_exclude_none=True).
 */
export interface LLMSettingsResponse {
    provider?: string | null;
    model?: string | null;
    api_key?: string | null;
    base_url?: string | null;
    concurrency?: number | null;
}

/**
 * PUT /admin/llm-settings payload. provider is required; api_key is optional and
 * only sent when (re)setting the key so a blank field preserves the stored key.
 */
export interface LLMSettingsUpsert {
    provider: string;
    model?: string | null;
    api_key?: string | null;
    base_url?: string | null;
    concurrency?: number | null;
}

/**
 * Result wrapper for the BYO-LLM server actions that preserves the HTTP status
 * so the UI can distinguish tier/flag gating (402/403) and base_url validation
 * (400) from generic failures.
 */
export interface LLMSettingsActionResult<T> {
    data?: T;
    error?: string;
    status?: number;
}

// ---- Provider types ----

export type Provider = "github" | "gitlab" | "jira" | "linear" | "launchdarkly";

export const PROVIDERS: Provider[] = ["github", "gitlab", "jira", "linear", "launchdarkly"];

export const PROVIDER_LABELS: Record<Provider, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    launchdarkly: "LaunchDarkly",
};

export const PROVIDER_SYNC_TARGETS: Record<Provider, string[]> = {
    github: ["git", "prs", "cicd", "deployments", "incidents", "work-items"],
    gitlab: ["git", "prs", "cicd", "deployments", "incidents", "work-items", "feature-flags"],
    jira: ["work-items"],
    linear: ["work-items"],
    launchdarkly: ["feature-flags"],
};

// ---- Platform Stats ----

export interface PlatformStats {
    total_organizations: number;
    active_organizations: number;
    total_users: number;
    active_users: number;
    superuser_count: number;
    total_memberships: number;
    tier_distribution: Record<string, number>;
    total_sync_configs: number;
    active_sync_configs: number;
    recent_syncs_success: number;
    recent_syncs_failed: number;
}

// ---- Licensing & Feature Flags ----

export interface FeatureFlag {
    id: string;
    key: string;
    name: string;
    description: string | null;
    category: string;
    min_tier: string;
    is_enabled: boolean;
    is_beta: boolean;
    is_deprecated: boolean;
    created_at: string;
}

export interface FeatureOverride {
    id: string;
    org_id: string;
    feature_id: string;
    feature_key: string;
    is_enabled: boolean;
    expires_at: string | null;
    config: Record<string, unknown> | null;
    reason: string | null;
    created_by: string | null;
    created_at: string;
}

export interface FeatureOverrideCreate {
    feature_id: string;
    is_enabled?: boolean;
    expires_at?: string | null;
    config?: Record<string, unknown> | null;
    reason?: string | null;
}

export interface OrgEntitlements {
    org_id: string;
    tier: string;
    licensed_users: number | null;
    licensed_repos: number | null;
    features: Record<string, boolean>;
    features_override: Record<string, boolean> | null;
    limits_override: Record<string, number | null> | null;
    expires_at: string | null;
    is_valid: boolean;
    limits: Record<string, number | null>;
}

// ---- Organization Deletion ----

/** Raw deletion scope from dev-health-ops (snake_case). */
export interface DeletionScopeRaw {
    total: number;
    tables: Record<string, number>;
}

/** Raw deletion result from dev-health-ops DELETE /orgs/{id} (snake_case). */
export interface DeletionResultRaw {
    organization_id: string;
    dry_run: boolean;
    timestamp: string;
    postgres: DeletionScopeRaw;
    clickhouse: DeletionScopeRaw;
    disabled_jobs: number;
    credentials_deleted: number;
    warnings: string[];
}

/** Normalized deletion plan consumed by the UI deletion-plan preview. */
export interface DeletionPlan {
    organizationId: string;
    dryRun: boolean;
    timestamp: string;
    deletedCounts: Record<string, number>;
    disabledJobCount: number;
    credentialDeletionCount: number;
    warnings: string[];
}

// ---- Customer Push (CHAOS-2690/2714) ----
//
// Mirrors dev-health-ops/api/admin/routers/customer_push.py and
// api/admin/schemas/customer_push.py EXACTLY — verified 2026-07-02 against
// the real router/schema source in the ops chaos-2690-integration branch
// (CHAOS-2696/2712/2694 are merged there), not just the design-doc sketch.
// Real-backend corrections vs. the earlier design-doc-only draft of this
// section:
//   - source rows use `id`, not `source_id`; there is NO
//     `conflicting_managed_sync` boolean — the backend returns
//     `matched_integration_source_id` (the CC5-matched managed source, if
//     any) plus a `warnings` string array to render verbatim.
//   - `GET /customer-push/sources` has NO server-side `?system=` filter —
//     it always returns every source for the org; filter client-side.
//   - token rows carry `token_prefix` (always present) and NO
//     `status`/`last_result` field — status is derived client-side from
//     revoked_at/expires_at/last_used_at, see
//     src/lib/customer-push/token-status.ts. Token prefix is `fcpush_`.
//   - `POST .../tokens` request body has no `source_id` — it's implied by
//     the URL (`/sources/{id}/tokens` vs. the org-wide `/tokens`).
//   - batch LIST items (`GET .../sources/{id}/batches`) are wrapped in a
//     paginated envelope `{items, total, limit, offset}`, NOT a bare array,
//     and carry `source_system`/`source_instance` (no `source_id`,
//     `producer_version`, or window_started_at/ended_at — those only exist
//     on the single-batch detail response).
//   - batch DETAIL (`GET .../batches/{id}`) additionally carries `attempts`,
//     `updated_at`, and `rejected_records_total/limit/offset` (the rejected-
//     records sub-list is itself paginated, default limit 50). It has NO
//     `recompute_status` field yet in this branch — CHAOS-2699 adds that in
//     wave 3; treat it as optional until then.
//   - `error_summary.top_codes` is an array of `{code, count}` sorted
//     descending by count, NOT a `Record<string, number>`.
//   - `GET .../schemas` returns `{schemaVersions, recordKinds, limits}`
//     (camelCase — a pass-through of the data-plane schema shape), not a
//     `schemas: [...]` list of per-version entries.

export type CustomerPushSystem = Provider | "custom";
export type CustomerPushMode = "fullchaos_sync" | "customer_push" | "disabled";
export type CustomerPushWebhookMode = "disabled" | "customer_relay" | "fullchaos_hosted";
export type CustomerPushBatchStatus =
    "accepted" | "stream_unavailable" | "processing" | "completed" | "partial" | "failed";
export type CustomerPushScope = "schema:read" | "ingest:write" | "ingest:status";
export type CustomerPushRecomputeStatus =
    "not_applicable" | "pending" | "dispatched" | "skipped_no_scope" | "failed";

export interface CustomerPushSource {
    id: string;
    org_id: string;
    system: CustomerPushSystem;
    instance: string;
    display_name: string | null;
    mode: CustomerPushMode;
    enabled: boolean;
    webhook_mode: CustomerPushWebhookMode;
    /** CC5-matched managed-sync source id, whether or not it's actively enabled. */
    matched_integration_source_id: string | null;
    /** Non-blocking, backend-authored warning copy — render verbatim. */
    warnings: string[];
    created_at: string;
    updated_at: string;
}

export interface CustomerPushSourceCreate {
    system: CustomerPushSystem;
    instance: string;
    display_name?: string;
}

export interface CustomerPushSourceUpdate {
    enabled?: boolean;
    display_name?: string;
}

/** List/detail item — never includes the plaintext token. */
export interface CustomerPushToken {
    id: string;
    org_id: string;
    name: string;
    source_id: string | null;
    token_prefix: string;
    scopes: CustomerPushScope[];
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
}

export interface CustomerPushTokenCreate {
    name: string;
    scopes: CustomerPushScope[];
    expires_at?: string | null;
}

/** Create/rotate response only — the plaintext token is shown exactly once. */
export interface CustomerPushTokenCreateResponse {
    id: string;
    org_id: string;
    token: string;
    token_prefix: string;
    name: string;
    source_id: string | null;
    scopes: CustomerPushScope[];
    expires_at: string | null;
    created_at: string;
}

/** GET .../sources/{id}/batches list item — a deliberately thinner shape than the detail response. */
export interface CustomerPushBatchSummary {
    ingestion_id: string;
    source_system: CustomerPushSystem;
    source_instance: string;
    producer: string | null;
    status: CustomerPushBatchStatus;
    items_received: number;
    items_accepted: number;
    items_rejected: number;
    created_at: string;
    completed_at: string | null;
}

export interface CustomerPushBatchListResponse {
    items: CustomerPushBatchSummary[];
    total: number;
    limit: number;
    offset: number;
}

export interface CustomerPushRejectedRecord {
    index: number;
    kind: string;
    external_id: string | null;
    code: string;
    path: string | null;
    message: string;
}

export interface CustomerPushErrorSummary {
    total_rejected: number;
    stored_rejections: number;
    truncated: boolean;
    top_codes: Array<{ code: string; count: number }>;
}

export interface CustomerPushBatchDetail {
    ingestion_id: string;
    org_id: string;
    status: CustomerPushBatchStatus;
    attempts: number;
    source_system: CustomerPushSystem;
    source_instance: string;
    producer: string | null;
    producer_version: string | null;
    schema_version: string;
    window_started_at: string | null;
    window_ended_at: string | null;
    items_received: number;
    items_accepted: number;
    items_rejected: number;
    record_counts: Record<string, number> | null;
    error_summary: CustomerPushErrorSummary | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    rejected_records: CustomerPushRejectedRecord[];
    rejected_records_total: number;
    rejected_records_limit: number;
    rejected_records_offset: number;
    /** Not surfaced by this branch's status.py yet — CHAOS-2699 (wave 3) adds it. */
    recompute_status?: CustomerPushRecomputeStatus;
}

export interface CustomerPushValidateResponse {
    valid: boolean;
    items_accepted: number;
    items_rejected: number;
    errors: CustomerPushRejectedRecord[];
}

/** GET .../schemas — camelCase pass-through of the data-plane schema shape. */
export interface CustomerPushSchemaListResponse {
    schemaVersions: string[];
    recordKinds: string[];
    limits: { maxRecordsPerBatch: number; maxBodyBytes: number };
}

/** GET .../schemas/{version} — camelCase pass-through, JSON-Schema bodies. */
export interface CustomerPushSchemaDetailResponse {
    schemaVersion: string;
    envelope: Record<string, unknown>;
    recordKinds: Record<string, Record<string, unknown>>;
    limits: { maxRecordsPerBatch: number; maxBodyBytes: number };
}

export interface CustomerPushBatchListParams {
    status?: CustomerPushBatchStatus;
    producer?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
}
