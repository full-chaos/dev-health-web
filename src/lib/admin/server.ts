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
} from "./types";

async function getToken(): Promise<string> {
  const session = await auth();
  if (!session?.access_token) {
    throw new AdminApiError(401, "Unauthorized", "No access token");
  }
  return session.access_token;
}

type ActionResult<T> = { data: T; error?: never } | { data?: never; error: string };

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { data };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { error: err.detail || err.message };
    }
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function listUsers(): Promise<ActionResult<User[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.list(token);
  });
}

export async function getUser(userId: string): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.get(userId, token);
  });
}

export async function createUser(data: UserCreate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.create(data, token);
  });
}

export async function updateUser(userId: string, data: UserUpdate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.update(userId, data, token);
  });
}

export async function deleteUser(userId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.delete(userId, token);
  });
}

export async function listCredentials(): Promise<ActionResult<IntegrationCredential[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.credentials.list(token);
  });
}

export async function createCredential(
  data: IntegrationCredentialCreate
): Promise<ActionResult<IntegrationCredential>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.credentials.create(data, token);
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
    const token = await getToken();
    const result = await adminApi.credentials.test(provider, name, credentials, token);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function deleteCredential(
  provider: string,
  name: string
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.credentials.delete(provider, name, token);
    revalidatePath("/admin/integrations", "page");
    return result;
  });
}

export async function listSyncConfigs(): Promise<ActionResult<SyncConfig[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.syncConfigs.list(token);
  });
}

export async function createSyncConfig(
  data: SyncConfigCreate
): Promise<ActionResult<SyncConfig>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.syncConfigs.create(data, token);
  });
}

export async function getSyncConfig(id: string): Promise<ActionResult<SyncConfig>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    // syncConfigs API doesn't have a get-by-id endpoint; filter from list
    const configs = await adminApi.syncConfigs.list(token);
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
    const token = await getToken();
    const result = await adminApi.syncConfigs.update(id, data, token);
    revalidatePath("/admin/sync");
    revalidatePath(`/admin/sync/${id}`);
    return result;
  });
}

export async function deleteSyncConfig(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.syncConfigs.delete(id, token);
    revalidatePath("/admin/sync");
    return result;
  });
}

export async function triggerSync(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.syncConfigs.trigger(id, token);
    revalidatePath("/admin/sync");
    revalidatePath(`/admin/sync/${id}`);
    return result;
  });
}

export async function getSyncJobs(id: string): Promise<ActionResult<SyncJob[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.syncConfigs.jobs(id, token);
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
    const token = await getToken();
    return adminApi.identities.list(token);
  });
}

export async function createIdentity(
  data: IdentityMappingCreate
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.identities.create(data, token);
  });
}

export async function getIdentity(id: string): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.identities.get(id, token);
  });
}

export async function updateIdentity(
  id: string,
  data: IdentityMappingUpdate
): Promise<ActionResult<IdentityMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.identities.update(id, data, token);
  });
}

export async function deleteIdentity(id: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.identities.delete(id, token);
  });
}

export async function listTeams(): Promise<ActionResult<TeamMapping[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.list(token);
  });
}

export async function createTeam(data: TeamMappingCreate): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.create(data, token);
  });
}

export async function getTeam(teamId: string): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.get(teamId, token);
  });
}

export async function updateTeam(
  teamId: string,
  data: TeamMappingUpdate
): Promise<ActionResult<TeamMapping>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.update(teamId, data, token);
  });
}

export async function deleteTeam(teamId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.delete(teamId, token);
  });
}

export async function discoverTeams(provider: string): Promise<ActionResult<TeamDiscoverResponse>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.discover(provider, token);
  });
}

export async function importTeams(
  teams: DiscoveredTeam[],
  onConflict: "skip" | "merge"
): Promise<ActionResult<TeamImportResponse>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.import({ teams, on_conflict: onConflict }, token);
  });
}

export async function getPendingTeamChanges(): Promise<ActionResult<PendingChangesResponse>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.pendingChanges(token);
  });
}

export async function approveTeamChanges(
  teamId: string,
  changeIndices?: number[],
  approveAll = false
): Promise<ActionResult<{ approved: number }>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const result = await adminApi.teams.approveChanges(teamId, changeIndices, approveAll, token);
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
    const token = await getToken();
    const result = await adminApi.teams.dismissChanges(teamId, changeIndices, dismissAll, token);
    revalidatePath('/admin/teams');
    return result;
  });
}

export async function triggerTeamDriftSync(): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.triggerDriftSync(token);
  });
}

export async function listSettingCategories(): Promise<ActionResult<string[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.settings.listCategories(token);
  });
}

export async function listSettings(category: string): Promise<ActionResult<Setting[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const response = await adminApi.settings.listByCategory(category, token);
    return response.settings;
  });
}

export async function createSetting(data: SettingCreate): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.settings.create(data, token);
  });
}

export async function updateSetting(
  category: string,
  key: string,
  data: SettingUpdate
): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.settings.update(category, key, data, token);
  });
}

export async function deleteSetting(category: string, key: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.settings.delete(category, key, token);
  });
}

export async function getCurrentOrg(): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const session = await auth();
    if (!session?.access_token) {
      throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.get(orgId, session.access_token);
  });
}

export async function updateCurrentOrg(
  data: OrganizationUpdate
): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const session = await auth();
    if (!session?.access_token) {
      throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.update(orgId, data, session.access_token);
  });
}

export async function deleteCurrentOrg(): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const session = await auth();
    if (!session?.access_token) {
      throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    const orgId = session.user?.org_id;
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.delete(orgId, session.access_token);
  });
}

export async function getSecuritySettings(): Promise<ActionResult<Setting[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    const response = await adminApi.settings.listByCategory("security", token);
    return response.settings;
  });
}

export async function updateSecuritySetting(
  key: string,
  value: string
): Promise<ActionResult<Setting>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.settings.update("security", key, { value }, token);
  });
}

export async function startImpersonation(targetUserId: string): Promise<ActionResult<{
  access_token: string;
  token_type: string;
  expires_in: number;
  impersonated_user: { id: string; email: string; role: string; org_id: string };
}>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.impersonation.start(targetUserId, token);
  });
}

export async function stopImpersonation(): Promise<ActionResult<{
  access_token: string;
  token_type: string;
  expires_in: number;
}>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.impersonation.stop(token);
  });
}

export async function getImpersonationStatus(): Promise<ActionResult<{
  is_impersonating: boolean;
  impersonated_user_id: string | null;
  real_user_id: string | null;
}>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.impersonation.status(token);
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
