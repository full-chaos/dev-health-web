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
  accessToken?: string
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
    listCategories: (token?: string) =>
      request<string[]>("/settings/categories", {}, token),

    listByCategory: (category: string, token?: string) =>
      request<SettingsListResponse>(`/settings/${category}`, {}, token),

    get: (category: string, key: string, token?: string) =>
      request<Setting>(`/settings/${category}/${key}`, {}, token),

    create: (data: SettingCreate, token?: string) =>
      request<Setting>("/settings", { method: "POST", body: JSON.stringify(data) }, token),

    update: (category: string, key: string, data: SettingUpdate, token?: string) =>
      request<Setting>(
        `/settings/${category}/${key}`,
        { method: "PUT", body: JSON.stringify(data) },
        token
      ),

    delete: (category: string, key: string, token?: string) =>
      request<void>(`/settings/${category}/${key}`, { method: "DELETE" }, token),
  },

  credentials: {
    list: (token?: string) =>
      request<IntegrationCredential[]>("/credentials", {}, token),

    get: (provider: string, name: string, token?: string) =>
      request<IntegrationCredential>(`/credentials/${provider}/${name}`, {}, token),

    create: (data: IntegrationCredentialCreate, token?: string) =>
      request<IntegrationCredential>(
        "/credentials",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (provider: string, name: string, data: IntegrationCredentialUpdate, token?: string) =>
      request<IntegrationCredential>(
        `/credentials/${provider}/${name}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (provider: string, name: string, token?: string) =>
      request<void>(`/credentials/${provider}/${name}`, { method: "DELETE" }, token),

    test: (provider: string, name: string = "default", credentials?: Record<string, unknown>, token?: string) =>
      request<TestConnectionResponse>(
        "/credentials/test",
        { method: "POST", body: JSON.stringify({ provider, name, credentials }) },
        token
      ),
  },

  syncConfigs: {
    list: (token?: string) =>
      request<SyncConfig[]>("/sync-configs", {}, token),

    get: (id: string, token?: string) =>
      request<SyncConfig>(`/sync-configs/${id}`, {}, token),

    create: (data: SyncConfigCreate, token?: string) =>
      request<SyncConfig>(
        "/sync-configs",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (id: string, data: SyncConfigUpdate, token?: string) =>
      request<SyncConfig>(
        `/sync-configs/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (id: string, token?: string) =>
      request<void>(`/sync-configs/${id}`, { method: "DELETE" }, token),

    trigger: (id: string, token?: string) =>
      request<void>(`/sync-configs/${id}/trigger`, { method: "POST" }, token),

    jobs: (id: string, token?: string) =>
      request<SyncJob[]>(`/sync-configs/${id}/jobs`, {}, token),
  },

  identities: {
    list: (token?: string) =>
      request<IdentityMapping[]>("/identities", {}, token),

    get: (id: string, token?: string) =>
      request<IdentityMapping>(`/identities/${id}`, {}, token),

    create: (data: IdentityMappingCreate, token?: string) =>
      request<IdentityMapping>(
        "/identities",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (id: string, data: IdentityMappingUpdate, token?: string) =>
      request<IdentityMapping>(
        `/identities/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (id: string, token?: string) =>
      request<void>(`/identities/${id}`, { method: "DELETE" }, token),
  },

  teams: {
    list: (token?: string) =>
      request<TeamMapping[]>("/teams", {}, token),

    get: (teamId: string, token?: string) =>
      request<TeamMapping>(`/teams/${teamId}`, {}, token),

    create: (data: TeamMappingCreate, token?: string) =>
      request<TeamMapping>(
        "/teams",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (teamId: string, data: TeamMappingUpdate, token?: string) =>
      request<TeamMapping>(
        `/teams/${teamId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (teamId: string, token?: string) =>
      request<void>(`/teams/${teamId}`, { method: "DELETE" }, token),
  },

  users: {
    list: (token?: string) =>
      request<User[]>("/users", {}, token),

    get: (userId: string, token?: string) =>
      request<User>(`/users/${userId}`, {}, token),

    create: (data: UserCreate, token?: string) =>
      request<User>(
        "/users",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (userId: string, data: UserUpdate, token?: string) =>
      request<User>(
        `/users/${userId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    setPassword: (userId: string, password: string, token?: string) =>
      request<void>(
        `/users/${userId}/password`,
        { method: "POST", body: JSON.stringify({ password }) },
        token
      ),

    delete: (userId: string, token?: string) =>
      request<void>(`/users/${userId}`, { method: "DELETE" }, token),
  },

  orgs: {
    list: (token?: string) =>
      request<Organization[]>("/orgs", {}, token),

    get: (orgId: string, token?: string) =>
      request<Organization>(`/orgs/${orgId}`, {}, token),

    create: (data: OrganizationCreate, token?: string) =>
      request<Organization>(
        "/orgs",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (orgId: string, data: OrganizationUpdate, token?: string) =>
      request<Organization>(
        `/orgs/${orgId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (orgId: string, token?: string) =>
      request<void>(`/orgs/${orgId}`, { method: "DELETE" }, token),

    members: {
      list: (orgId: string, token?: string) =>
        request<Membership[]>(`/orgs/${orgId}/members`, {}, token),

      add: (orgId: string, data: MembershipCreate, token?: string) =>
        request<Membership>(
          `/orgs/${orgId}/members`,
          { method: "POST", body: JSON.stringify(data) },
          token
        ),

      updateRole: (orgId: string, userId: string, data: MembershipUpdateRole, token?: string) =>
        request<Membership>(
          `/orgs/${orgId}/members/${userId}`,
          { method: "PATCH", body: JSON.stringify(data) },
          token
        ),

      remove: (orgId: string, userId: string, token?: string) =>
        request<void>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }, token),

      transferOwnership: (orgId: string, newOwnerUserId: string, token?: string) =>
        request<void>(
          `/orgs/${orgId}/transfer-ownership`,
          { method: "POST", body: JSON.stringify({ new_owner_user_id: newOwnerUserId }) },
          token
        ),
    },
  },

  audit: {
    list: (filters?: AuditLogFilter, limit = 50, offset = 0, token?: string) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value != null) params.set(key, String(value));
        });
      }
      return request<AuditLogListResponse>(`/audit?${params.toString()}`, {}, token);
    },

    get: (id: string, token?: string) =>
      request<AuditLogListResponse["items"][0]>(`/audit/${id}`, {}, token),

    export: (format: "json" | "csv" = "json", filters?: AuditLogFilter, token?: string) => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value != null) params.set(key, String(value));
        });
      }
      return request<Blob>(`/audit/export?${params.toString()}`, {}, token);
    },

    actions: (token?: string) =>
      request<string[]>("/audit/actions", {}, token),
  },

  ipAllowlist: {
    list: (limit = 50, offset = 0, token?: string) =>
      request<IPAllowlistListResponse>(
        `/ip-allowlist?limit=${limit}&offset=${offset}`,
        {},
        token
      ),

    get: (id: string, token?: string) =>
      request<IPAllowlist>(`/ip-allowlist/${id}`, {}, token),

    create: (data: IPAllowlistCreate, token?: string) =>
      request<IPAllowlist>(
        "/ip-allowlist",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (id: string, data: IPAllowlistUpdate, token?: string) =>
      request<IPAllowlist>(
        `/ip-allowlist/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (id: string, token?: string) =>
      request<void>(`/ip-allowlist/${id}`, { method: "DELETE" }, token),

    check: (ipAddress: string, token?: string) =>
      request<IPCheckResponse>(
        "/ip-allowlist/check",
        { method: "POST", body: JSON.stringify({ ip_address: ipAddress }) },
        token
      ),
  },

  retention: {
    list: (limit = 50, offset = 0, token?: string) =>
      request<RetentionPolicyListResponse>(
        `/retention?limit=${limit}&offset=${offset}`,
        {},
        token
      ),

    get: (id: string, token?: string) =>
      request<RetentionPolicy>(`/retention/${id}`, {}, token),

    create: (data: RetentionPolicyCreate, token?: string) =>
      request<RetentionPolicy>(
        "/retention",
        { method: "POST", body: JSON.stringify(data) },
        token
      ),

    update: (id: string, data: RetentionPolicyUpdate, token?: string) =>
      request<RetentionPolicy>(
        `/retention/${id}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token
      ),

    delete: (id: string, token?: string) =>
      request<void>(`/retention/${id}`, { method: "DELETE" }, token),

    execute: (id: string, dryRun = true, token?: string) =>
      request<RetentionExecuteResponse>(
        `/retention/${id}/execute`,
        { method: "POST", body: JSON.stringify({ dry_run: dryRun }) },
        token
      ),

    resourceTypes: (token?: string) =>
      request<string[]>("/retention/resource-types", {}, token),
  },
};

export type AdminApi = typeof adminApi;
