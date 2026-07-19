/**
 * TypeScript interfaces for MSW mock REST responses.
 *
 * These types mirror the backend Pydantic response shapes from dev-health-ops.
 * Auth types correspond to dev_health_ops/api/auth/router.py
 * Admin types correspond to the admin credential/sync-config/team/identity handlers.
 */

// ---------------------------------------------------------------------------
// Auth types (mirror dev_health_ops/api/auth/router.py Pydantic models)
// ---------------------------------------------------------------------------

export interface UserInfo {
    id: string;
    email: string;
    username?: string | null;
    full_name?: string | null;
    org_id?: string | null;
    role: string;
    is_superuser: boolean;
    permissions?: string[];
}

export interface LoginResponseBody {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    needs_onboarding: boolean;
    user: UserInfo;
}

export interface RegisterResponseBody {
    message: string;
    user_id: string;
    org_id: string;
}

export interface OnboardResponseBody {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    org_id: string;
    org_name: string;
    role: string;
}

export interface TokenValidateResponseBody {
    valid: boolean;
    user_id?: string | null;
    email?: string | null;
    org_id?: string | null;
    role?: string | null;
    expires_at?: string | null;
}

export interface TokenRefreshResponseBody {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user?: UserInfo | null;
}

// ---------------------------------------------------------------------------
// Admin / integration types (moved from inline definitions in handlers.ts)
// ---------------------------------------------------------------------------

export interface MockBillingPrice {
    id: string;
    plan_id: string;
    interval: string;
    amount: number;
    currency: string;
    is_active: boolean;
    stripe_price_id: string | null;
}

export interface MockBillingPlan {
    id: string;
    key: string;
    name: string;
    description: string | null;
    tier: string;
    is_active: boolean;
    display_order: number;
    stripe_product_id: string | null;
    metadata: Record<string, unknown>;
    prices: MockBillingPrice[];
    bundles: Array<{
        id: string;
        key: string;
        name: string;
        description: string | null;
        features: string[];
    }>;
}

/** Mirrors the IntegrationCredential API response shape. */
export interface MockCredential {
    id: string;
    provider: string;
    name: string;
    config: Record<string, unknown>;
    created_at: string;
}

/** Mirrors the SyncConfig API response shape. */
export interface MockSyncConfig {
    id: string;
    provider: string;
    name: string;
    enabled: boolean;
    credential_id?: string | null;
    sync_targets?: string[];
    sync_options?: Record<string, unknown>;
    is_active?: boolean;
    schedule_cron?: string | null;
    timezone?: string | null;
    initial_sync_depth?: number | null;
    last_sync_at?: string | null;
    last_sync_success?: boolean | null;
    last_sync_error?: string | null;
    parent_id?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Mirrors the backend TeamMapping contract (src/lib/admin/types.ts) so admin
 * surfaces that dereference array fields (repo_patterns, project_keys) never
 * throw on mock-created rows. `source` is a legacy mock-only field kept for
 * existing specs.
 */
export interface MockTeam {
    id: string;
    team_id: string;
    name: string;
    source?: string;
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

/**
 * Mirrors the backend IdentityMapping contract (src/lib/admin/types.ts) so
 * admin surfaces that dereference team_ids/provider_identities never throw on
 * mock-created rows. provider/external_id/user_id are legacy mock-only fields
 * kept for existing specs.
 */
export interface MockIdentity {
    id: string;
    canonical_id: string;
    display_name: string | null;
    email: string | null;
    provider_identities: Record<string, string[]>;
    team_ids: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
    provider?: string;
    external_id?: string;
    user_id?: string;
}

/**
 * Mirrors IngestSourceResponse (CHAOS-2690/2714) — verified directly against
 * dev-health-ops/api/admin/schemas/customer_push.py. See
 * src/lib/admin/types.ts's CustomerPushSource for the full field-shape notes.
 */
export interface MockCustomerPushSource {
    id: string;
    org_id: string;
    system: string;
    instance: string;
    display_name: string | null;
    mode: "fullchaos_sync" | "customer_push" | "disabled";
    enabled: boolean;
    webhook_mode: "disabled" | "customer_relay" | "fullchaos_hosted";
    matched_integration_source_id: string | null;
    created_at: string;
    updated_at: string;
    warnings: string[];
}

/** Mirrors IngestTokenResponse — no `token`/`status`/`last_result` field. */
export interface MockCustomerPushToken {
    id: string;
    org_id: string;
    source_id: string | null;
    name: string;
    token_prefix: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
}

/** Mirrors IngestTokenCreateResponse — one-time plaintext token. */
export interface MockCustomerPushTokenCreateResponse extends MockCustomerPushToken {
    token: string;
}

/** Mirrors AdminBatchListItemResponse (list row — no window/producer_version/org_id). */
export interface MockCustomerPushBatchSummary {
    ingestion_id: string;
    status: "accepted" | "stream_unavailable" | "processing" | "completed" | "partial" | "failed";
    source_system: string;
    source_instance: string;
    producer: string | null;
    items_received: number;
    items_accepted: number;
    items_rejected: number;
    created_at: string;
    completed_at: string | null;
}

/** Mirrors AdminBatchListResponse — paginated envelope, not a bare array. */
export interface MockCustomerPushBatchListResponse {
    items: MockCustomerPushBatchSummary[];
    total: number;
    limit: number;
    offset: number;
}

/** Mirrors AdminRejectedRecordResponse — `path` is nullable. */
export interface MockCustomerPushRejectedRecord {
    index: number;
    kind: string;
    external_id: string | null;
    code: string;
    message: string;
    path: string | null;
}

/** Mirrors AdminBatchResponse (full detail, incl. paginated rejected_records). */
export interface MockCustomerPushBatchDetail extends MockCustomerPushBatchSummary {
    org_id: string;
    attempts: number;
    producer_version: string | null;
    schema_version: string;
    window_started_at: string | null;
    window_ended_at: string | null;
    record_counts: Record<string, number> | null;
    error_summary: {
        total_rejected: number;
        stored_rejections: number;
        truncated: boolean;
        top_codes: { code: string; count: number }[];
    } | null;
    updated_at: string;
    rejected_records: MockCustomerPushRejectedRecord[];
    rejected_records_total: number;
    rejected_records_limit: number;
    rejected_records_offset: number;
}

/**
 * Mirrors IngestSourceResponse (CHAOS-2690/2714) — verified directly against
 * dev-health-ops/api/admin/schemas/customer_push.py. See
 * src/lib/admin/types.ts's CustomerPushSource for the full field-shape notes.
 */
export interface MockCustomerPushSource {
    id: string;
    org_id: string;
    system: string;
    instance: string;
    display_name: string | null;
    mode: "fullchaos_sync" | "customer_push" | "disabled";
    enabled: boolean;
    webhook_mode: "disabled" | "customer_relay" | "fullchaos_hosted";
    matched_integration_source_id: string | null;
    created_at: string;
    updated_at: string;
    warnings: string[];
}

/** Mirrors IngestTokenResponse — no `token`/`status`/`last_result` field. */
export interface MockCustomerPushToken {
    id: string;
    org_id: string;
    source_id: string | null;
    name: string;
    token_prefix: string;
    scopes: string[];
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    created_at: string;
}

/** Mirrors IngestTokenCreateResponse — one-time plaintext token. */
export interface MockCustomerPushTokenCreateResponse extends MockCustomerPushToken {
    token: string;
}

/** Mirrors AdminBatchListItemResponse (list row — no window/producer_version/org_id). */
export interface MockCustomerPushBatchSummary {
    ingestion_id: string;
    status: "accepted" | "stream_unavailable" | "processing" | "completed" | "partial" | "failed";
    source_system: string;
    source_instance: string;
    producer: string | null;
    items_received: number;
    items_accepted: number;
    items_rejected: number;
    created_at: string;
    completed_at: string | null;
}

/** Mirrors AdminBatchListResponse — paginated envelope, not a bare array. */
export interface MockCustomerPushBatchListResponse {
    items: MockCustomerPushBatchSummary[];
    total: number;
    limit: number;
    offset: number;
}

/** Mirrors AdminRejectedRecordResponse — `path` is nullable. */
export interface MockCustomerPushRejectedRecord {
    index: number;
    kind: string;
    external_id: string | null;
    code: string;
    message: string;
    path: string | null;
}

/** Mirrors AdminBatchResponse (full detail, incl. paginated rejected_records). */
export interface MockCustomerPushBatchDetail extends MockCustomerPushBatchSummary {
    org_id: string;
    attempts: number;
    producer_version: string | null;
    schema_version: string;
    window_started_at: string | null;
    window_ended_at: string | null;
    record_counts: Record<string, number> | null;
    error_summary: {
        total_rejected: number;
        stored_rejections: number;
        truncated: boolean;
        top_codes: { code: string; count: number }[];
    } | null;
    updated_at: string;
    rejected_records: MockCustomerPushRejectedRecord[];
    rejected_records_total: number;
    rejected_records_limit: number;
    rejected_records_offset: number;
}

/** Full credential response as returned by GET /api/v1/admin/credentials. */
export type IntegrationCredentialResponse = MockCredential;

/** Full sync config response as returned by GET /api/v1/admin/sync-configs. */
export type SyncConfigResponse = MockSyncConfig;
