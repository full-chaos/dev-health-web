"use server";

import { auth } from "@/lib/auth";
import { adminApi, AdminApiError } from "./api";
import type {
  User,
  UserCreate,
  UserUpdate,
  IntegrationCredential,
  IntegrationCredentialCreate,
  TestConnectionResponse,
  SyncConfig,
  SyncConfigCreate,
  IdentityMapping,
  IdentityMappingCreate,
  TeamMapping,
  TeamMappingCreate,
  Setting,
  SettingCreate,
  SettingUpdate,
  Organization,
  OrganizationUpdate,
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
    return adminApi.credentials.create(data, token);
  });
}

export async function testConnection(
  provider: string,
  name = "default"
): Promise<ActionResult<TestConnectionResponse>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.credentials.test(provider, name, token);
  });
}

export async function deleteCredential(
  provider: string,
  name: string
): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.credentials.delete(provider, name, token);
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

export async function deleteTeam(teamId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.teams.delete(teamId, token);
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
