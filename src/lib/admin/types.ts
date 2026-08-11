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

export type SyncCoverageHealth = "healthy" | "stale" | "gaps" | "failed" | "insufficient_data";

export type SyncCoverageStatus =
    | "healthy"
    | "stale"
    | "gaps"
    | "failed"
    | "insufficient_data"
    | "paused"
    | "not_scheduled"
    | "running"
    // Provider supports this dataset but no enabled IntegrationDataset row
    // exists for it -- never selected by an operator, distinct from
    // "insufficient_data" (enabled, zero rows so far). CHAOS-3399.
    | "not_enabled";

export type SyncCoverageDataBasis = "planner" | "legacy";

export interface SyncCoverageRange {
    since: string;
    before: string;
    source_ids: string[];
    run_ids: string[];
}

/** Server-owned, config-wide date range accepted by the backfill endpoint. */
export interface SyncCoverageBackfillWindow {
    since: string;
    before: string;
}

export interface SyncRunJobEnrichment {
    mode: string;
    triggered_by: string;
    requested_range: SyncCoverageRange | null;
    covered_range: SyncCoverageRange | null;
    total_units: number;
    completed_units: number;
    failed_units: number;
    sync_run_id: string;
}

export interface SyncCoverageOverall {
    health: SyncCoverageHealth;
    latest_successful_run_at: string | null;
    latest_covered_through: string | null;
    next_scheduled_run_at: string | null;
    gap_count: number;
    stale_dataset_count: number;
    failed_range_count: number;
}

export interface SyncCoverageDataset {
    dataset_key: string;
    status: SyncCoverageStatus;
    covered_through: string | null;
    requested_ranges: SyncCoverageRange[];
    covered_ranges: SyncCoverageRange[];
    gaps: SyncCoverageRange[];
    stale_ranges: SyncCoverageRange[];
    failed_ranges: SyncCoverageRange[];
}

export interface SyncCoverageSource {
    source_id: string;
    source_name: string;
    status: SyncCoverageStatus;
    covered_through: string | null;
    gap_count: number;
    failed_range_count: number;
}

export interface SyncCoverageSummary {
    config_id: string;
    provider: string;
    generated_at: string;
    data_basis: SyncCoverageDataBasis;
    history_lookback_days: number;
    truncated_before: string;
    /** Explicit response window. Optional while Web and Ops deploy independently. */
    coverage_since?: string;
    coverage_through?: string;
    /** True when retained facts exist before the exact response window. */
    is_truncated?: boolean;
    /** Stable backend reason code; the UI must map it to user-safe copy. */
    truncation_reason?: string | null;
    /** Authoritative config-wide actions. Present empty means no action is available. */
    backfill_windows?: SyncCoverageBackfillWindow[];
    overall: SyncCoverageOverall;
    datasets: SyncCoverageDataset[];
    sources: SyncCoverageSource[];
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
    sync_run?: SyncRunJobEnrichment | null;
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
    /**
     * Count of times this unit was deferred by the sync budget guard
     * (`error_category: "budget_deferred"`). Optional: backend field is
     * in-flight (CHAOS-3412) and may be absent until that PR merges.
     */
    budget_deferrals?: number;
    /**
     * Timestamp of the first budget deferral for this unit, else null.
     * Optional: backend field is in-flight (CHAOS-3412).
     */
    budget_first_deferred_at?: string | null;
    duration_seconds: number | null;
    error: string | null;
    /**
     * Extracted failure category (e.g. rate_limit), or null. Budget-guard
     * values: "budget_deferred" (retrying, still within caps),
     * "budget_deferral_exhausted" (terminal — the `error` text names the
     * bucket, cap, and remedies), and "deferral_exhausted" (terminal —
     * aggregate cap: the unit oscillated between budget and rate-limit
     * deferral episodes without ever running; `error` names the last
     * episode kind and both counters). Persisted strings — render verbatim,
     * never invent variants.
     */
    error_category: string | null;
    last_heartbeat_at: string | null;
    result: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

/**
 * Watermark-vs-now lag for one (source, dataset) pair (CHAOS-3430). Mirrors
 * dev-health-ops api/admin/schemas/integrations.py:SyncRunDatasetFreshness.
 *
 * Every field is computed backend-side from the persisted `sync_watermarks`
 * rows. The UI renders them verbatim — it never recomputes lag from a
 * timestamp, re-derives the catch-up verdict, or counts ticks itself.
 */
export interface SyncRunDatasetFreshness {
    /** IntegrationSource id, matching SyncRunUnit.source_id for label reuse. */
    source_id: string;
    source_name: string | null;
    dataset_key: string;
    cost_class: string;
    /** Stored watermark (ISO, UTC); null when the dataset never stamped one. */
    watermark_at: string | null;
    /** `now - watermark_at` in whole seconds; null without a watermark. */
    lag_seconds: number | null;
    /** True only for a heavy dataset trailing by more than window_cap_days. */
    catching_up: boolean;
    /** Scheduled ticks still needed to reach now; null unless catching_up. */
    ticks_behind: number | null;
    window_cap_days: number;
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
    /**
     * Count of units currently blocked on the sync budget guard (`retrying`
     * with `error_category: "budget_deferred"`). Optional: backend field is
     * in-flight (CHAOS-3412) and may be absent until that PR merges.
     */
    budget_blocked_unit_count?: number;
    unit_count: number;
    partial_failure_summary: Record<string, unknown> | null;
    /** Earliest available_at among retrying units, else null. */
    next_retry_at: string | null;
    /**
     * Watermark lag per (source, dataset) pair planned by this run, for
     * datasets that carry a watermark (CHAOS-3430). Optional: absent when the
     * backend predates the field, which must render as "no lag information",
     * never as "nothing is behind".
     */
    dataset_freshness?: SyncRunDatasetFreshness[];
    /**
     * How many of those pairs are a heavy dataset still ratcheting toward the
     * current time. Optional for the same forward-compat reason.
     */
    catching_up_dataset_count?: number;
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

export interface BackfillSelector {
    since: string;
    before: string;
    source_ids?: string[];
    dataset_keys?: string[];
}

/** CHAOS-3758 structured selector. Never combine this with legacy flat fields. */
export interface BackfillRequest {
    selector: BackfillSelector;
}

export interface BackfillResponse {
    status: string;
    task_id?: string;
    backfill_job_id?: string;
    sync_run_id?: string;
    total_units?: number;
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
    updated_at: string;
}

export interface BackfillJobListResponse {
    items: BackfillJob[];
    total: number;
    limit: number;
    offset: number;
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

/**
 * Payload for POST /identities. The backend endpoint
 * (create_or_update_identity) is an UPSERT keyed on `canonical_id` with
 * replacement semantics for `provider_identities` / `team_ids`: a field
 * that IS present in the request body replaces the stored value wholesale,
 * even if the array/object is empty. There is no PATCH /identities/{id}
 * route — both create and update flows must POST the FULL desired state
 * (not a partial diff) through this same shape.
 */
export interface IdentityMappingCreate {
    canonical_id: string;
    display_name?: string | null;
    email?: string | null;
    provider_identities?: Record<string, string[]>;
    team_ids?: string[];
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
    /**
     * Calendar-month organization hard cap in integer micro-USD. Omit to
     * preserve the existing budget; zero is an explicit hard stop.
     */
    budget_limit_micro_usd?: number | null;
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

// ---- BYO LLM Organization Budget (CHAOS-3238) ----

export type LLMBudgetReason =
    | "available"
    | "budget_not_configured"
    | "pricing_unavailable"
    | "usage_unavailable"
    | "budget_exhausted";

/**
 * GET /admin/llm-settings/budget response. Monetary values use integer
 * micro-USD so the browser never treats provider spend as binary floats.
 */
export interface LLMBudgetResponse {
    used_micro_usd: number | null;
    limit_micro_usd: number | null;
    remaining_micro_usd: number | null;
    window: "calendar_month_utc";
    reset_at: string;
    enforcement_available: boolean;
    reason: LLMBudgetReason;
    maximum_limit_micro_usd: number;
    pricing_version: string | null;
}

// ---- BYO LLM Spend Summary (CHAOS-2564) ----

/**
 * A single run's LLM spend aggregate row, returned inside
 * `GET /admin/llm-settings/spend`. Sourced from ClickHouse `llm_token_usage`
 * (per-run calls/tokens/model) joined with `failures_by_class` derived from
 * `work_unit_investments.categorization_status` / `categorization_errors_json`
 * for that run (see CHAOS-2349 plan §3 Task B).
 *
 * `failures_by_class` keys are persisted **categorization-outcome** classes
 * (e.g. "llm_error", "low_confidence") — NOT the exact fatal provider-exception
 * taxonomy (`LLMAuthError`/`LLMRateLimitError`/etc, which is only logged, never
 * persisted). The UI must label this distinction explicitly (plan §7 C4).
 */
export interface LLMSpendRunSummary {
    run_id: string;
    provider?: string | null;
    model: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    computed_at?: string | null;
    failures_by_class: Record<string, number>;
}

/**
 * A pre-run_id `llm_token_usage` row — spend recorded before `run_id` was
 * threaded through the sink (plan §7 C1). `run_id` is always the empty
 * string here (`marker: "legacy_empty_run_id"` flags it); the UI must never
 * present these as per-run data (plan §6.3, §7 C4).
 */
export interface LLMSpendLegacyRow {
    run_id: "";
    marker: "legacy_empty_run_id";
    provider: string | null;
    model: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    computed_at: string | null;
}

/**
 * `GET /admin/llm-settings/spend` response. Org-scoped; `runs` defaults to
 * the latest ~20 non-empty `run_id`s within the last 30 days (`since`),
 * capped at `limit`, ordered by `max(computed_at) DESC` (CHAOS-2349 plan
 * §6.3). `legacy` holds pre-run_id rows excluded from `runs` — spend
 * happened but can't be attributed to a specific run; the UI must render an
 * explicit legacy state for them and never fold them into per-run data
 * (plan §6.3, §7 C4).
 */
export interface LLMSpendSummaryResponse {
    since: string;
    limit: number;
    runs: LLMSpendRunSummary[];
    legacy: LLMSpendLegacyRow[];
}

/**
 * Reason code for the current BYO-LLM status evaluation (CHAOS-2560, plan
 * correction C2). The backend evaluator is pure (no AuditLog side effects on
 * a GET) and returns exactly one of these buckets.
 */
export type LLMSettingsStatusReasonCode =
    "not_configured" | "unknown_provider" | "missing_credentials" | "invalid_base_url" | "active";

/**
 * BYO preflight outcome (CHAOS-3265, amended for the CHAOS-3254
 * READINESS_VERSION bump). Independent of `active`/`degraded` — a saved BYO
 * configuration can be explicitly preflight-checked regardless of whether it
 * currently wins Ask Dev's provider-selection arbitration.
 *
 * `"stale"` means a preflight was run before, but the stored result no
 * longer corresponds to the current BYO configuration or the backend's
 * current readiness-version requirement (the org edited BYO settings since
 * the last check, or the backend's certification requirements changed). This
 * is NOT an error/failure state — it is "not currently certified, re-run" —
 * and must render with neutral/informational styling, never the negative
 * "failed" tone. `readiness_safe_failure_reason` is only meaningful for
 * `"failed"`; it must not be treated as an error explanation when stale.
 */
export type LLMSettingsReadinessState = "ready" | "failed" | "stale" | "never_checked";

/**
 * GET /admin/llm-settings/status response (CHAOS-2560, extended CHAOS-3265).
 * Drives the BYO-LLM status badge on the AI Setup summary (CHAOS-2565):
 * `active` renders "Active", `configured && degraded` renders "Invalid —
 * using platform default", and `!configured` renders "Not configured". This
 * endpoint is a pure evaluator over stored settings + recent fallback audit
 * rows — never a live provider call — so a fetch failure degrades gracefully
 * to the settings-derived Saved/Not configured wording rather than blocking
 * the UI. `readiness`/`readiness_checked_at`/`readiness_safe_failure_reason`
 * (CHAOS-3265) reflect the last explicit BYO preflight run via
 * `POST /admin/llm-settings/readiness`, independent of this GET.
 */
export interface LLMSettingsStatusResponse {
    configured: boolean;
    active: boolean;
    degraded: boolean;
    reason_code: LLMSettingsStatusReasonCode;
    last_fallback_at: string | null;
    readiness: LLMSettingsReadinessState;
    readiness_checked_at: string | null;
    readiness_safe_failure_reason: string | null;
}

// ---- Ask Dev administration (CHAOS-3217) ----

export type AskDevEntitlementState =
    "enabled" | "not_entitled" | "globally_disabled" | "org_disabled" | "unavailable";

export type AskDevAdminReadiness =
    | "ready"
    | "unsupported_model"
    | "missing_credentials"
    | "disabled"
    | "degraded"
    | "stale_readiness";

export type AskDevFallbackPolicy = "fail_closed" | "platform";
export type AskDevRetentionDays = 0 | 30;

export interface AskDevAdminSettings {
    retention_days: AskDevRetentionDays;
    fallback_policy: AskDevFallbackPolicy;
    emergency_disabled: boolean;
    platform_monthly_request_limit: number;
    platform_monthly_cost_limit_microusd: number;
}

export interface AskDevAdminSettingsPatch {
    retention_days?: AskDevRetentionDays;
    fallback_policy?: AskDevFallbackPolicy;
    emergency_disabled?: boolean;
    platform_monthly_request_limit?: number;
    platform_monthly_cost_limit_microusd?: number;
}

export interface AskDevRequestLimits {
    active_runs_per_user: number;
    active_runs_per_organization: number;
    requests_per_user_per_15_minutes: number;
    requests_per_organization_per_hour: number;
}

export interface AskDevPlatformAllowanceBounds {
    request_minimum: number;
    request_maximum: number;
    cost_minimum_microusd: number;
    cost_maximum_microusd: number;
}

export type AskDevPlatformAllowanceWarning =
    "none" | "eighty_percent" | "ninety_percent" | "exhausted";

export interface AskDevPlatformAllowanceUsage {
    window_start: string;
    reset_at: string;
    request_limit: number;
    request_used: number;
    request_remaining: number;
    cost_limit_microusd: number;
    cost_used_microusd: number;
    cost_remaining_microusd: number;
    warning: AskDevPlatformAllowanceWarning;
}

export interface AskDevAdminResponse {
    schema_version: string;
    entitlement_state: AskDevEntitlementState;
    ask_dev_enabled: boolean;
    chat_window_available: boolean;
    full_page_available: boolean;
    effective_provider_label: string | null;
    effective_model_label: string | null;
    provider_source: "platform" | "byo" | null;
    readiness: AskDevAdminReadiness;
    readiness_checked_at: string | null;
    readiness_version: string | null;
    administrator_safe_failure_reason: string | null;
    settings: AskDevAdminSettings;
    retention_options: AskDevRetentionDays[];
    fallback_options: AskDevFallbackPolicy[];
    request_limits: AskDevRequestLimits;
    platform_allowance_bounds: AskDevPlatformAllowanceBounds;
    no_training_by_default: boolean;
}

export interface AskDevAdminUsageResponse {
    schema_version: string;
    use_case: "ask_dev";
    since: string;
    through: string;
    request_count: number;
    run_count: number;
    completed_runs: number;
    failed_runs: number;
    degraded_runs: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_microusd: number | null;
    failure_rate: number;
    degraded_rate: number;
    readiness: AskDevAdminReadiness;
    platform_allowance: AskDevPlatformAllowanceUsage;
}
// ---- Provider types ----

export type Provider = "github" | "gitlab" | "jira" | "linear" | "launchdarkly" | "pagerduty";

export const PROVIDERS: Provider[] = [
    "github",
    "gitlab",
    "jira",
    "linear",
    "launchdarkly",
    "pagerduty",
];

export const PROVIDER_LABELS: Record<Provider, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    launchdarkly: "LaunchDarkly",
    pagerduty: "PagerDuty",
};

export const PROVIDER_SYNC_TARGETS: Record<Provider, string[]> = {
    github: ["git", "prs", "cicd", "tests", "deployments", "incidents", "work-items"],
    gitlab: [
        "git",
        "prs",
        "cicd",
        "tests",
        "deployments",
        "incidents",
        "work-items",
        "feature-flags",
    ],
    jira: ["work-items"],
    linear: ["work-items"],
    launchdarkly: ["feature-flags"],
    pagerduty: ["operational"],
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

// ---- Platform Ask Dev Readiness (CHAOS-3265) ----

/**
 * GET/POST /admin/platform/ask-dev/readiness response. Superuser-only —
 * describes the operator/platform-owned Ask Dev provider (env-configured),
 * never an organization's BYO configuration. `readiness` reuses
 * `AskDevAdminReadiness` because the enum values are identical; do not
 * duplicate the union.
 */
export interface PlatformAskDevReadinessResponse {
    schema_version: "platform_ask_dev_readiness.v1";
    configured: boolean;
    /** Safe label only, e.g. "OpenAI compatible" — never a raw endpoint or credential. */
    provider_label: string | null;
    model_label: string | null;
    readiness: AskDevAdminReadiness;
    readiness_checked_at: string | null;
    readiness_version: string | null;
    safe_remediation: string | null;
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
// Mirrors dev-health-ops/api/admin/schemas/customer_push.py and
// api/admin/routers/customer_push.py EXACTLY — verified by reading the
// merged source directly (ops worktree chaos-2690-integration, 2026-07-02),
// not derived from the original design doc or brief sketches, both of which
// drifted from what actually landed. Notable corrections vs the design doc:
//   - `display_name` is nullable (falls back to `instance` in the UI).
//   - No `conflicting_managed_sync` boolean — the real signals are
//     `matched_integration_source_id` (persisted at registration) and a
//     `warnings: string[]` array (non-blocking, populated on writes).
//   - Tokens carry `org_id` and `token_prefix`; `IngestTokenCreate` has NO
//     `source_id` field — it's derived from the URL path, never the body.
//   - `GET /customer-push/sources` has no server-side `system` filter —
//     always returns every org source; filter client-side.
//   - Batch list is a paginated envelope `{items,total,limit,offset}`, not
//     a bare array. Batch rows use `source_system`/`source_instance`, never
//     `source_id`. `producer`/`producer_version`/window timestamps are
//     nullable. `record_counts`/`error_summary` are nullable.
//   - `error_summary.top_codes` is `{code,count}[]`, not a Record.
//   - `rejected_records` on the detail response is itself paginated
//     (`rejected_records_total/limit/offset`).
//   - `recompute_status` is NOT surfaced by the admin batch detail endpoint
//     yet (CHAOS-2699's status.py extension had not landed in the merged
//     source as of this writing) — omitted here; do not render it until a
//     future patch adds the field back once it actually exists.
//   - The validate proxy (`POST .../sources/{id}/validate`, owned by
//     CHAOS-2695/wave 4) does not exist in the merged source yet — its type
//     below is retained from the brief's contract sketch since there is no
//     ground truth to verify against; treat as provisional until CHAOS-2695
//     lands and re-verify then.

export type CustomerPushSystem = Provider | "custom";
export type CustomerPushMode = "fullchaos_sync" | "customer_push" | "disabled";
export type CustomerPushWebhookMode = "disabled" | "customer_relay" | "fullchaos_hosted";
export type CustomerPushBatchStatus =
    "accepted" | "stream_unavailable" | "processing" | "completed" | "partial" | "failed";
export type CustomerPushScope = "schema:read" | "ingest:write" | "ingest:status";

export interface CustomerPushSource {
    id: string;
    org_id: string;
    system: CustomerPushSystem;
    instance: string;
    display_name: string | null;
    mode: CustomerPushMode;
    enabled: boolean;
    webhook_mode: CustomerPushWebhookMode;
    matched_integration_source_id: string | null;
    created_at: string;
    updated_at: string;
    warnings: string[];
}

export interface CustomerPushSourceCreate {
    system: CustomerPushSystem;
    instance: string;
    display_name?: string | null;
    mode?: CustomerPushMode;
    webhook_mode?: CustomerPushWebhookMode;
}

export interface CustomerPushSourceUpdate {
    display_name?: string | null;
    mode?: CustomerPushMode;
    enabled?: boolean;
    webhook_mode?: CustomerPushWebhookMode;
}

/** List/detail item — never includes the plaintext token. */
export interface CustomerPushToken {
    id: string;
    org_id: string;
    source_id: string | null;
    name: string;
    token_prefix: string;
    scopes: CustomerPushScope[];
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
}

/** No `source_id` field — the backend derives it from the URL path. */
export interface CustomerPushTokenCreate {
    name: string;
    scopes: CustomerPushScope[];
    expires_at?: string | null;
}

/** Create/rotate response only — the plaintext token is shown exactly once. */
export interface CustomerPushTokenCreateResponse {
    id: string;
    org_id: string;
    source_id: string | null;
    name: string;
    token: string;
    token_prefix: string;
    scopes: CustomerPushScope[];
    expires_at: string | null;
    created_at: string;
}

export interface CustomerPushRejectedRecord {
    index: number;
    kind: string;
    external_id: string | null;
    code: string;
    message: string;
    path: string | null;
}

export interface CustomerPushBatchSummary {
    ingestion_id: string;
    status: CustomerPushBatchStatus;
    source_system: CustomerPushSystem;
    source_instance: string;
    producer: string | null;
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

export interface CustomerPushErrorSummaryTopCode {
    code: string;
    count: number;
}

export interface CustomerPushErrorSummary {
    total_rejected: number;
    stored_rejections: number;
    truncated: boolean;
    top_codes: CustomerPushErrorSummaryTopCode[];
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
}

/**
 * Mirrors ops AdminValidateResponse (api/admin/schemas/customer_push.py,
 * landed with CHAOS-2695): snake_case; envelope-level failures are reported
 * through this same 200 shape (valid:false + synthetic error rows with
 * code "invalid_envelope"), never as 4xx.
 */
export interface CustomerPushValidateResponse {
    valid: boolean;
    items_accepted: number;
    items_rejected: number;
    errors: CustomerPushRejectedRecord[];
}

export interface CustomerPushSchemaLimits {
    maxRecordsPerBatch: number;
    maxBodyBytes: number;
}

export interface CustomerPushSchemaListResponse {
    schemaVersions: string[];
    recordKinds: string[];
    limits: CustomerPushSchemaLimits;
}

export interface CustomerPushSchemaDetailResponse {
    schemaVersion: string;
    envelope: Record<string, unknown>;
    recordKinds: Record<string, unknown>;
    limits: CustomerPushSchemaLimits;
}

export interface CustomerPushBatchListParams {
    status?: CustomerPushBatchStatus;
    producer?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
}
