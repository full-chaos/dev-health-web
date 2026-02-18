import { getBackendUrl } from "@/lib/origin";
import type {
  Setting,
  SettingCreate,
  SettingUpdate,
  SettingsListResponse,
  IntegrationCredential,
  IntegrationCredentialCreate,
  IntegrationCredentialUpdate,
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
  TeamDiscoverResponse,
  TeamImportRequest,
  TeamImportResponse,
  PendingChangesResponse,
  User,
  UserCreate,
  UserUpdate,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Membership,
  MembershipCreate,
  MembershipUpdateRole,
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
  PlatformStats,
  FeatureFlag,
  FeatureOverride,
  FeatureOverrideCreate,
  OrgEntitlements,
} from "./types";

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public detail?: string
  ) {
    super(detail || `${status} ${statusText}`);
    this.name = "AdminApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
  orgId?: string
): Promise<T> {
  const baseUrl = getBackendUrl();
  const url = `${baseUrl}/api/v1/admin${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  if (orgId) {
    (headers as Record<string, string>)["X-Org-Id"] = orgId;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorData = await response.json();
      detail = errorData.detail || errorData.message;
    } catch {
      detail = undefined;
    }
    throw new AdminApiError(response.status, response.statusText, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function licensingRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
  orgId?: string
): Promise<T> {
  const baseUrl = getBackendUrl();
  const url = `${baseUrl}/api/v1/licensing${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  if (orgId) {
    (headers as Record<string, string>)["X-Org-Id"] = orgId;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorData = await response.json();
      detail = errorData.detail || errorData.message;
    } catch {
      detail = undefined;
    }
    throw new AdminApiError(response.status, response.statusText, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const adminApi = {
  settings: {
    listCategories: (token?: string, orgId?: string) =>
      request<string[]>("/settings/categories", {}, token, orgId),

    listByCategory: (category: string, token?: string, orgId?: string) =>
      request<SettingsListResponse>(`/settings/${category}`, {}, token, orgId),

    get: (category: string, key: string, token?: string, orgId?: string) =>
      request<Setting>(`/settings/${category}/${key}`, {}, token, orgId),

    create: (data: SettingCreate, token?: string, orgId?: string) =>
      request<Setting>("/settings", { method: "POST", body: JSON.stringify(data) }, token, orgId),

    update: (category: string, key: string, data: SettingUpdate, token?: string, orgId?: string) =>
      request<Setting>(
        `/settings/${category}/${key}`,
        { method: "PUT", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (category: string, key: string, token?: string, orgId?: string) =>
      request<void>(`/settings/${category}/${key}`, { method: "DELETE" }, token, orgId),
  },

  credentials: {
    list: (token?: string, orgId?: string) =>
      request<IntegrationCredential[]>("/credentials", {}, token, orgId),

    get: (provider: string, name: string, token?: string, orgId?: string) =>
      request<IntegrationCredential>(`/credentials/${provider}/${name}`, {}, token, orgId),

    create: (data: IntegrationCredentialCreate, token?: string, orgId?: string) =>
      request<IntegrationCredential>(
        "/credentials",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (provider: string, name: string, data: IntegrationCredentialUpdate, token?: string, orgId?: string) =>
      request<IntegrationCredential>(
        `/credentials/${provider}/${name}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (provider: string, name: string, token?: string, orgId?: string) =>
      request<void>(`/credentials/${provider}/${name}`, { method: "DELETE" }, token, orgId),

    test: (provider: string, name: string = "default", credentials?: Record<string, unknown>, token?: string, orgId?: string) =>
      request<TestConnectionResponse>(
        "/credentials/test",
        { method: "POST", body: JSON.stringify({ provider, name, credentials }) },
        token,
        orgId
      ),
  },

  syncConfigs: {
    list: (token?: string, orgId?: string) =>
      request<SyncConfig[]>("/sync-configs", {}, token, orgId),

    get: (id: string, token?: string, orgId?: string) =>
      request<SyncConfig>(`/sync-configs/${id}`, {}, token, orgId),

    create: (data: SyncConfigCreate, token?: string, orgId?: string) =>
      request<SyncConfig>(
        "/sync-configs",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (id: string, data: SyncConfigUpdate, token?: string, orgId?: string) =>
      request<SyncConfig>(
        `/sync-configs/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (id: string, token?: string, orgId?: string) =>
      request<void>(`/sync-configs/${id}`, { method: "DELETE" }, token, orgId),

    trigger: (id: string, token?: string, orgId?: string) =>
      request<void>(`/sync-configs/${id}/trigger`, { method: "POST" }, token, orgId),

    jobs: (id: string, token?: string, orgId?: string) =>
      request<SyncJob[]>(`/sync-configs/${id}/jobs`, {}, token, orgId),
  },

  identities: {
    list: (token?: string, orgId?: string) =>
      request<IdentityMapping[]>("/identities", {}, token, orgId),

    get: (id: string, token?: string, orgId?: string) =>
      request<IdentityMapping>(`/identities/${id}`, {}, token, orgId),

    create: (data: IdentityMappingCreate, token?: string, orgId?: string) =>
      request<IdentityMapping>(
        "/identities",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (id: string, data: IdentityMappingUpdate, token?: string, orgId?: string) =>
      request<IdentityMapping>(
        `/identities/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (id: string, token?: string, orgId?: string) =>
      request<void>(`/identities/${id}`, { method: "DELETE" }, token, orgId),
  },

  teams: {
    list: (token?: string, orgId?: string) =>
      request<TeamMapping[]>("/teams", {}, token, orgId),

    get: (teamId: string, token?: string, orgId?: string) =>
      request<TeamMapping>(`/teams/${teamId}`, {}, token, orgId),

    create: (data: TeamMappingCreate, token?: string, orgId?: string) =>
      request<TeamMapping>(
        "/teams",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (teamId: string, data: TeamMappingUpdate, token?: string, orgId?: string) =>
      request<TeamMapping>(
        `/teams/${teamId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (teamId: string, token?: string, orgId?: string) =>
      request<void>(`/teams/${teamId}`, { method: "DELETE" }, token, orgId),

    discover: (provider: string, token?: string, orgId?: string) =>
      request<TeamDiscoverResponse>(`/teams/discover?provider=${provider}`, {}, token, orgId),

    import: (data: TeamImportRequest, token?: string, orgId?: string) =>
      request<TeamImportResponse>(
        "/teams/import",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    pendingChanges: (token?: string, orgId?: string) =>
      request<PendingChangesResponse>('/teams/pending-changes', {}, token, orgId),

    approveChanges: (teamId: string, changeIndices?: number[], approveAll = false, token?: string, orgId?: string) =>
      request<{ approved: number }>(
        `/teams/${teamId}/approve-changes`,
        {
          method: 'POST',
          body: JSON.stringify({
            change_indices: changeIndices,
            approve_all: approveAll,
          }),
        },
        token,
        orgId
      ),

    dismissChanges: (teamId: string, changeIndices?: number[], dismissAll = false, token?: string, orgId?: string) =>
      request<{ dismissed: number }>(
        `/teams/${teamId}/dismiss-changes`,
        {
          method: 'POST',
          body: JSON.stringify({
            change_indices: changeIndices,
            dismiss_all: dismissAll,
          }),
        },
        token,
        orgId
      ),

    triggerDriftSync: (token?: string, orgId?: string) =>
      request<{ status: string }>('/teams/trigger-drift-sync', { method: 'POST' }, token, orgId),
  },

  users: {
    list: (token?: string, orgId?: string) =>
      request<User[]>("/users", {}, token, orgId),

    get: (userId: string, token?: string, orgId?: string) =>
      request<User>(`/users/${userId}`, {}, token, orgId),

    create: (data: UserCreate, token?: string, orgId?: string) =>
      request<User>(
        "/users",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (userId: string, data: UserUpdate, token?: string, orgId?: string) =>
      request<User>(
        `/users/${userId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    setPassword: (userId: string, password: string, token?: string, orgId?: string) =>
      request<void>(
        `/users/${userId}/password`,
        { method: "POST", body: JSON.stringify({ password }) },
        token,
        orgId
      ),

    delete: (userId: string, token?: string, orgId?: string) =>
      request<void>(`/users/${userId}`, { method: "DELETE" }, token, orgId),
  },

  orgs: {
    list: (token?: string, headerOrgId?: string) =>
      request<Organization[]>("/orgs", {}, token, headerOrgId),

    get: (orgId: string, token?: string, headerOrgId?: string) =>
      request<Organization>(`/orgs/${orgId}`, {}, token, headerOrgId),

    create: (data: OrganizationCreate, token?: string, headerOrgId?: string) =>
      request<Organization>(
        "/orgs",
        { method: "POST", body: JSON.stringify(data) },
        token,
        headerOrgId
      ),

    update: (orgId: string, data: OrganizationUpdate, token?: string, headerOrgId?: string) =>
      request<Organization>(
        `/orgs/${orgId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        headerOrgId
      ),

    delete: (orgId: string, token?: string, headerOrgId?: string) =>
      request<void>(`/orgs/${orgId}`, { method: "DELETE" }, token, headerOrgId),

    members: {
      list: (orgId: string, token?: string, headerOrgId?: string) =>
        request<Membership[]>(`/orgs/${orgId}/members`, {}, token, headerOrgId),

      add: (orgId: string, data: MembershipCreate, token?: string, headerOrgId?: string) =>
        request<Membership>(
          `/orgs/${orgId}/members`,
          { method: "POST", body: JSON.stringify(data) },
          token,
          headerOrgId
        ),

      updateRole: (orgId: string, userId: string, data: MembershipUpdateRole, token?: string, headerOrgId?: string) =>
        request<Membership>(
          `/orgs/${orgId}/members/${userId}`,
          { method: "PATCH", body: JSON.stringify(data) },
          token,
          headerOrgId
        ),

      remove: (orgId: string, userId: string, token?: string, headerOrgId?: string) =>
        request<void>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }, token, headerOrgId),

      transferOwnership: (orgId: string, newOwnerUserId: string, token?: string, headerOrgId?: string) =>
        request<void>(
          `/orgs/${orgId}/transfer-ownership`,
          { method: "POST", body: JSON.stringify({ new_owner_user_id: newOwnerUserId }) },
          token,
          headerOrgId
        ),
    },
  },

  audit: {
    list: (filters?: AuditLogFilter, limit = 50, offset = 0, token?: string, orgId?: string) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value != null) params.set(key, String(value));
        });
      }
      return request<AuditLogListResponse>(`/audit?${params.toString()}`, {}, token, orgId);
    },

    get: (id: string, token?: string, orgId?: string) =>
      request<AuditLogListResponse["items"][0]>(`/audit/${id}`, {}, token, orgId),

    export: (format: "json" | "csv" = "json", filters?: AuditLogFilter, token?: string, orgId?: string) => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value != null) params.set(key, String(value));
        });
      }
      return request<Blob>(`/audit/export?${params.toString()}`, {}, token, orgId);
    },

    actions: (token?: string, orgId?: string) =>
      request<string[]>("/audit/actions", {}, token, orgId),
  },

  ipAllowlist: {
    list: (limit = 50, offset = 0, token?: string, orgId?: string) =>
      request<IPAllowlistListResponse>(
        `/ip-allowlist?limit=${limit}&offset=${offset}`,
        {},
        token,
        orgId
      ),

    get: (id: string, token?: string, orgId?: string) =>
      request<IPAllowlist>(`/ip-allowlist/${id}`, {}, token, orgId),

    create: (data: IPAllowlistCreate, token?: string, orgId?: string) =>
      request<IPAllowlist>(
        "/ip-allowlist",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (id: string, data: IPAllowlistUpdate, token?: string, orgId?: string) =>
      request<IPAllowlist>(
        `/ip-allowlist/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (id: string, token?: string, orgId?: string) =>
      request<void>(`/ip-allowlist/${id}`, { method: "DELETE" }, token, orgId),

    check: (ipAddress: string, token?: string, orgId?: string) =>
      request<IPCheckResponse>(
        "/ip-allowlist/check",
        { method: "POST", body: JSON.stringify({ ip_address: ipAddress }) },
        token,
        orgId
      ),
  },

  retention: {
    list: (limit = 50, offset = 0, token?: string, orgId?: string) =>
      request<RetentionPolicyListResponse>(
        `/retention?limit=${limit}&offset=${offset}`,
        {},
        token,
        orgId
      ),

    get: (id: string, token?: string, orgId?: string) =>
      request<RetentionPolicy>(`/retention/${id}`, {}, token, orgId),

    create: (data: RetentionPolicyCreate, token?: string, orgId?: string) =>
      request<RetentionPolicy>(
        "/retention",
        { method: "POST", body: JSON.stringify(data) },
        token,
        orgId
      ),

    update: (id: string, data: RetentionPolicyUpdate, token?: string, orgId?: string) =>
      request<RetentionPolicy>(
        `/retention/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        orgId
      ),

    delete: (id: string, token?: string, orgId?: string) =>
      request<void>(`/retention/${id}`, { method: "DELETE" }, token, orgId),

    execute: (id: string, dryRun = true, token?: string, orgId?: string) =>
      request<RetentionExecuteResponse>(
        `/retention/${id}/execute`,
        { method: "POST", body: JSON.stringify({ dry_run: dryRun }) },
        token,
        orgId
      ),

    resourceTypes: (token?: string, orgId?: string) =>
      request<string[]>("/retention/resource-types", {}, token, orgId),
  },

  impersonation: {
    start: (targetUserId: string, token?: string, orgId?: string) =>
      request<{
        access_token: string;
        token_type: string;
        expires_in: number;
        impersonated_user: { id: string; email: string; role: string; org_id: string };
      }>("/impersonate", { method: "POST", body: JSON.stringify({ target_user_id: targetUserId }) }, token, orgId),

    stop: (token?: string, orgId?: string) =>
      request<{ access_token: string; token_type: string; expires_in: number }>(
        "/impersonate/stop", { method: "POST" }, token, orgId
      ),

    status: (token?: string, orgId?: string) =>
      request<{ is_impersonating: boolean; impersonated_user_id: string | null; real_user_id: string | null }>(
        "/impersonate/status", {}, token, orgId
      ),
  },

  platform: {
    stats: (token?: string) =>
      request<PlatformStats>("/platform/stats", {}, token),
  },

  licensing: {
    entitlements: (orgId: string, token?: string, headerOrgId?: string) =>
      licensingRequest<OrgEntitlements>(`/entitlements/${orgId}`, {}, token, headerOrgId),

    featureFlags: (token?: string, orgId?: string) =>
      request<FeatureFlag[]>("/feature-flags", {}, token, orgId),

    overrides: {
      list: (orgId: string, token?: string, headerOrgId?: string) =>
        request<FeatureOverride[]>(`/orgs/${orgId}/feature-overrides`, {}, token, headerOrgId),

      create: (orgId: string, data: FeatureOverrideCreate, token?: string, headerOrgId?: string) =>
        request<FeatureOverride>(
          `/orgs/${orgId}/feature-overrides`,
          { method: "POST", body: JSON.stringify(data) },
          token,
          headerOrgId
        ),

      delete: (orgId: string, overrideId: string, token?: string, headerOrgId?: string) =>
        request<void>(`/orgs/${orgId}/feature-overrides/${overrideId}`, { method: "DELETE" }, token, headerOrgId),
    },
  },

  platformAudit: {
    list: (filters?: AuditLogFilter, limit?: number, offset?: number, token?: string, orgId?: string) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (offset) params.set("offset", String(offset));
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v != null) params.set(k, String(v));
        });
      }
      return request<AuditLogListResponse>(`/platform/audit-logs?${params.toString()}`, {}, token, orgId);
    },
  },
};

export type AdminApi = typeof adminApi;
