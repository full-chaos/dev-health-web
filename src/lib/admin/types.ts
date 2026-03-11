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
}

export interface SyncJob {
  id: string;
  config_id: string;
  status: "pending" | "running" | "success" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  items_synced: number;
  error?: string;
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
  team_id: string;
  team_name: string;
  change_type: 'field_changed' | 'provider_removed' | 'new_team_available';
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

// ---- Provider types ----

export type Provider = 'github' | 'gitlab' | 'jira' | 'linear';

export const PROVIDERS: Provider[] = ['github', 'gitlab', 'jira', 'linear'];

export const PROVIDER_LABELS: Record<Provider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  jira: 'Jira',
  linear: 'Linear',
};

export const PROVIDER_SYNC_TARGETS: Record<Provider, string[]> = {
  github: ['git', 'prs', 'cicd', 'deployments', 'incidents', 'work-items'],
  gitlab: ['git', 'prs', 'cicd', 'deployments', 'incidents', 'work-items'],
  jira: ['work-items'],
  linear: ['work-items'],
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
