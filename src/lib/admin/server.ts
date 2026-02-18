"use server";

import { auth } from "@/lib/auth";
import { adminApi, AdminApiError } from "./api";
import { revalidatePath } from "next/cache";
import type {
  User,
  UserCreate,
  UserUpdate,
  IntegrationCredential,
  IntegrationCredentialCreate,
  TestConnectionResponse,
  SyncConfig,
  SyncConfigCreate,
  SyncConfigUpdate,
  SyncJob,
  IdentityMapping,
  IdentityMappingCreate,
  IdentityMappingUpdate,
  TeamMapping,
  TeamMappingCreate,
  TeamMappingUpdate,
  DiscoveredTeam,
  TeamDiscoverResponse,
  TeamImportResponse,
  PendingChangesResponse,
  Setting,
  SettingCreate,
  SettingUpdate,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Membership,
  PlatformStats,
  OrgEntitlements,
  FeatureFlag,
  FeatureOverride,
  FeatureOverrideCreate,
  AuditLogListResponse,
  AuditLogFilter,
  IPAllowlist,
  IPAllowlistCreate,
  IPAllowlistUpdate,
  IPAllowlistListResponse,
  IPCheckResponse,
  RetentionPolicy,
  RetentionPolicyCreate,
  RetentionPolicyUpdate,
  RetentionPolicyListResponse,
  RetentionExecuteResponse,
} from "./types";

interface SessionContext {
  token: string;
  orgId: string | undefined;
}

async function getSessionContext(): Promise<SessionContext> {
  const session = await auth();
  if (!session?.access_token) {
    throw new AdminApiError(401, "Unauthorized", "No access token");
  }
  return {
    token: session.access_token,
    orgId: session.user?.org_id || undefined,
  };
}

async function getToken(): Promise<string> {
  const ctx = await getSessionContext();
  return ctx.token;
}

type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { data };
  } catch (err) {
    if (err instanceof AdminApiError) {
      const detail = err.detail || err.message;
      return { error: typeof detail === "string" ? detail : JSON.stringify(detail) };
    }
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function listUsers(): Promise<ActionResult<User[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.list(token, orgId);
  });
}

export async function getUser(userId: string): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.get(userId, token, orgId);
  });
}

export async function createUser(data: UserCreate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.create(data, token, orgId);
  });
}

export async function updateUser(userId: string, data: UserUpdate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.update(userId, data, token, orgId);
  });
}

export async function deleteUser(userId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.delete(userId, token, orgId);
  });
}

export async function setUserPassword(userId: string, password: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.setPassword(userId, password, token, orgId);
  });
}

export async function listCredentials(): Promise<ActionResult<IntegrationCredential[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.credentials.list(token, orgId);
  });
}

export async function createCredential(
  data: IntegrationCredentialCreate
): Promise<ActionResult<IntegrationCredential>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.create(data, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function testConnection(
  provider: string,
  name = "default",
  credentials?: Record<string, unknown>
): Promise<ActionResult<TestConnectionResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.test(provider, name, credentials, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function deleteCredential(
  provider: string,
  name: string
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.credentials.delete(provider, name, token, orgId);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function listSyncConfigs(): Promise<ActionResult<SyncConfig[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.syncConfigs.list(token, orgId);
  });
}

export async function createSyncConfig(
  data: SyncConfigCreate
): Promise<ActionResult<SyncConfig>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.syncConfigs.create(data, token, orgId);
  });
}

export async function getSyncConfig(id: string): Promise<ActionResult<SyncConfig>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    // syncConfigs API doesn't have a get-by-id endpoint; filter from list
    const configs = await adminApi.syncConfigs.list(token, orgId);
    const config = configs.find((c) => c.id === id);
    if (!config) {
      throw new AdminApiError(404, "Not Found", "Sync configuration not found");
    }
    return config;
  });
}

export async function updateSyncConfig(
  id: string,
  data: SyncConfigUpdate
): Promise<ActionResult<SyncConfig>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.syncConfigs.update(id, data, token, orgId);
    revalidatePath("/admin/sync");
    revalidatePath(`/admin/sync/${id}`);
    return result;
  });
}

export async function deleteSyncConfig(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.syncConfigs.delete(id, token, orgId);
    revalidatePath("/admin/sync");
    return result;
  });
}

export async function triggerSync(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.syncConfigs.trigger(id, token, orgId);
    revalidatePath("/admin/sync");
    revalidatePath(`/admin/sync/${id}`);
    return result;
  });
}

export async function getSyncJobs(id: string): Promise<ActionResult<SyncJob[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.syncConfigs.jobs(id, token, orgId);
  });
}

export async function toggleSyncActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<SyncConfig>> {
  return updateSyncConfig(id, { is_active: isActive });
}

export async function listIdentities(): Promise<ActionResult<IdentityMapping[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.list(token, orgId);
  });
}

export async function createIdentity(
  data: IdentityMappingCreate
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.create(data, token, orgId);
  });
}

export async function getIdentity(id: string): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.get(id, token, orgId);
  });
}

export async function updateIdentity(
  id: string,
  data: IdentityMappingUpdate
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.update(id, data, token, orgId);
  });
}

export async function deleteIdentity(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.identities.delete(id, token, orgId);
  });
}

export async function listTeams(): Promise<ActionResult<TeamMapping[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.list(token, orgId);
  });
}

export async function createTeam(data: TeamMappingCreate): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.create(data, token, orgId);
  });
}

export async function getTeam(teamId: string): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.get(teamId, token, orgId);
  });
}

export async function updateTeam(
  teamId: string,
  data: TeamMappingUpdate
): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.update(teamId, data, token, orgId);
  });
}

export async function deleteTeam(teamId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.delete(teamId, token, orgId);
  });
}

export async function discoverTeams(provider: string): Promise<ActionResult<TeamDiscoverResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.discover(provider, token, orgId);
  });
}

export async function importTeams(
  teams: DiscoveredTeam[],
  onConflict: "skip" | "merge"
): Promise<ActionResult<TeamImportResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.import({ teams, on_conflict: onConflict }, token, orgId);
  });
}

export async function getPendingTeamChanges(): Promise<ActionResult<PendingChangesResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.pendingChanges(token, orgId);
  });
}

export async function approveTeamChanges(
  teamId: string,
  changeIndices?: number[],
  approveAll = false
): Promise<ActionResult<{ approved: number }>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.teams.approveChanges(teamId, changeIndices, approveAll, token, orgId);
    revalidatePath('/admin/teams');
    return result;
  });
}

export async function dismissTeamChanges(
  teamId: string,
  changeIndices?: number[],
  dismissAll = false
): Promise<ActionResult<{ dismissed: number }>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.teams.dismissChanges(teamId, changeIndices, dismissAll, token, orgId);
    revalidatePath('/admin/teams');
    return result;
  });
}

export async function triggerTeamDriftSync(): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.teams.triggerDriftSync(token, orgId);
  });
}

export async function listSettingCategories(): Promise<ActionResult<string[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.settings.listCategories(token, orgId);
  });
}

export async function listSettings(category: string): Promise<ActionResult<Setting[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const response = await adminApi.settings.listByCategory(category, token, orgId);
    return response.settings;
  });
}

export async function createSetting(data: SettingCreate): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.settings.create(data, token, orgId);
  });
}

export async function updateSetting(
  category: string,
  key: string,
  data: SettingUpdate
): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.settings.update(category, key, data, token, orgId);
  });
}

export async function deleteSetting(category: string, key: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.settings.delete(category, key, token, orgId);
  });
}

export async function getCurrentOrg(): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.get(orgId, token, orgId);
  });
}

export async function updateCurrentOrg(
  data: OrganizationUpdate
): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.update(orgId, data, token, orgId);
  });
}

export async function deleteCurrentOrg(): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.delete(orgId, token, orgId);
  });
}

export async function getSecuritySettings(): Promise<ActionResult<Setting[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const response = await adminApi.settings.listByCategory("security", token, orgId);
    return response.settings;
  });
}

export async function updateSecuritySetting(
  key: string,
  value: string
): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.settings.update("security", key, { value }, token, orgId);
  });
}

export async function startImpersonation(targetUserId: string): Promise<ActionResult<{
  access_token: string;
  token_type: string;
  expires_in: number;
  impersonated_user: { id: string; email: string; role: string; org_id: string };
}>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.impersonation.start(targetUserId, token, orgId);
  });
}

export async function stopImpersonation(): Promise<ActionResult<{
  access_token: string;
  token_type: string;
  expires_in: number;
}>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.impersonation.stop(token, orgId);
  });
}

export async function getImpersonationStatus(): Promise<ActionResult<{
  is_impersonating: boolean;
  impersonated_user_id: string | null;
  real_user_id: string | null;
}>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.impersonation.status(token, orgId);
  });
}

// ---- Superadmin: Organization Management ----

export async function listOrganizations(): Promise<ActionResult<Organization[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.list(token);
  });
}

export async function getOrganization(orgId: string): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.get(orgId, token);
  });
}

export async function createOrganization(data: OrganizationCreate): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.create(data, token);
  });
}

export async function updateOrganization(orgId: string, data: OrganizationUpdate): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.update(orgId, data, token);
  });
}

export async function deleteOrganization(orgId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.delete(orgId, token);
  });
}

export async function listOrgMembers(orgId: string): Promise<ActionResult<Membership[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.orgs.members.list(orgId, token);
  });
}

export async function getPlatformStats(): Promise<ActionResult<PlatformStats>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.platform.stats(token);
  });
}

export async function getOrgEntitlements(orgId: string): Promise<ActionResult<OrgEntitlements>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.licensing.entitlements(orgId, token);
  });
}

export async function listFeatureFlags(): Promise<ActionResult<FeatureFlag[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.licensing.featureFlags(token);
  });
}

export async function listFeatureOverrides(orgId: string): Promise<ActionResult<FeatureOverride[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.licensing.overrides.list(orgId, token);
  });
}

export async function createFeatureOverride(
  orgId: string,
  data: FeatureOverrideCreate
): Promise<ActionResult<FeatureOverride>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.licensing.overrides.create(orgId, data, token);
    revalidatePath(`/superadmin/licensing/${orgId}`);
    return result;
  });
}

export async function deleteFeatureOverride(
  orgId: string,
  overrideId: string
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.licensing.overrides.delete(orgId, overrideId, token);
    revalidatePath(`/superadmin/licensing/${orgId}`);
    return result;
  });
}

export async function listPlatformAuditLogs(
  filters?: AuditLogFilter,
  limit?: number,
  offset?: number
): Promise<ActionResult<AuditLogListResponse>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.platformAudit.list(filters, limit, offset, token);
  });
}


// ---- Org-scoped Audit Logs ----

export async function listAuditLogs(
  filters?: AuditLogFilter,
  limit?: number,
  offset?: number
): Promise<ActionResult<AuditLogListResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.audit.list(filters, limit ?? 50, offset ?? 0, token, orgId);
  });
}

export async function getAuditLog(id: string): Promise<ActionResult<AuditLogListResponse["items"][0]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.audit.get(id, token, orgId);
  });
}

export async function listAuditActions(): Promise<ActionResult<string[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.audit.actions(token, orgId);
  });
}

// ---- IP Allowlist ----

export async function listIPAllowlistEntries(
  limit?: number,
  offset?: number
): Promise<ActionResult<IPAllowlistListResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.ipAllowlist.list(limit ?? 50, offset ?? 0, token, orgId);
  });
}

export async function createIPAllowlistEntry(
  data: IPAllowlistCreate
): Promise<ActionResult<IPAllowlist>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.create(data, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function updateIPAllowlistEntry(
  id: string,
  data: IPAllowlistUpdate
): Promise<ActionResult<IPAllowlist>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.update(id, data, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function deleteIPAllowlistEntry(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.ipAllowlist.delete(id, token, orgId);
    revalidatePath("/admin/ip-allowlist");
    return result;
  });
}

export async function checkIPAllowed(ipAddress: string): Promise<ActionResult<IPCheckResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.ipAllowlist.check(ipAddress, token, orgId);
  });
}

// ---- Data Retention Policies ----

export async function listRetentionPolicies(
  limit?: number,
  offset?: number
): Promise<ActionResult<RetentionPolicyListResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.retention.list(limit ?? 50, offset ?? 0, token, orgId);
  });
}

export async function createRetentionPolicy(
  data: RetentionPolicyCreate
): Promise<ActionResult<RetentionPolicy>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.create(data, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function updateRetentionPolicy(
  id: string,
  data: RetentionPolicyUpdate
): Promise<ActionResult<RetentionPolicy>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.update(id, data, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function deleteRetentionPolicy(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    const result = await adminApi.retention.delete(id, token, orgId);
    revalidatePath("/admin/retention");
    return result;
  });
}

export async function executeRetentionPolicy(
  id: string,
  dryRun = true
): Promise<ActionResult<RetentionExecuteResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.retention.execute(id, dryRun, token, orgId);
  });
}

export async function listRetentionResourceTypes(): Promise<ActionResult<string[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.retention.resourceTypes(token, orgId);
  });
}
