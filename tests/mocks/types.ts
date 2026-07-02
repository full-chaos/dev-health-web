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

export interface MockTeam {
    id: string;
    team_id: string;
    name: string;
    source: string;
}

export interface MockIdentity {
    id: string;
    provider: string;
    external_id: string;
    user_id: string;
}

/**
 * Mirrors IngestSourceResponse (dev-health-ops
 * api/admin/schemas/customer_push.py, CHAOS-2696) — verified against the
 * real router source, NOT the CHAOS-2714 design doc's illustrative sketch.
 * No `conflicting_managed_sync` field exists; the backend returns
 * `matched_integration_source_id` + a `warnings` string array instead.
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

/** Mirrors IngestTokenResponse — no status/last_result field, derived client-side. */
export interface MockCustomerPushToken {
    id: string;
    org_id: string;
    name: string;
    source_id: string | null;
    token_prefix: string;
    scopes: string[];
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
}

/** Mirrors IngestTokenCreateResponse — one-time plaintext token. */
export interface MockCustomerPushTokenCreateResponse extends MockCustomerPushToken {
    token: string;
}

/** Mirrors AdminBatchListItemResponse — the LIST shape is deliberately thinner than the detail. */
export interface MockCustomerPushBatchListItem {
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

/** Mirrors AdminBatchResponse (detail) — has no `source_id`; no `recompute_status` yet in this branch. */
export interface MockCustomerPushBatch {
    ingestion_id: string;
    org_id: string;
    status: "accepted" | "stream_unavailable" | "processing" | "completed" | "partial" | "failed";
    attempts: number;
    source_system: string;
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
    error_summary: {
        total_rejected: number;
        stored_rejections: number;
        truncated: boolean;
        top_codes: Array<{ code: string; count: number }>;
    } | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    rejected_records: Array<{
        index: number;
        kind: string;
        external_id: string | null;
        code: string;
        path: string | null;
        message: string;
    }>;
    rejected_records_total: number;
    rejected_records_limit: number;
    rejected_records_offset: number;
    recompute_status?: "not_applicable" | "pending" | "dispatched" | "skipped_no_scope" | "failed";
}

/** Full credential response as returned by GET /api/v1/admin/credentials. */
export type IntegrationCredentialResponse = MockCredential;

/** Full sync config response as returned by GET /api/v1/admin/sync-configs. */
export type SyncConfigResponse = MockSyncConfig;
