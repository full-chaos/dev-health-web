import { request } from "./_request";
import type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Membership,
  MembershipCreate,
  MembershipUpdateRole,
  DeletionPlan,
  DeletionResultRaw,
} from "../types";

/**
 * Normalize the backend DeletionResult (snake_case, postgres/clickhouse split)
 * into the camelCase DeletionPlan the UI preview renders. Tables with zero rows
 * are omitted; ClickHouse tables that collide with a Postgres table name are
 * suffixed so counts are not silently merged.
 */
export function normalizeDeletionResult(raw: DeletionResultRaw): DeletionPlan {
  const deletedCounts: Record<string, number> = {};
  for (const [table, count] of Object.entries(raw.postgres?.tables ?? {})) {
    if (count > 0) deletedCounts[table] = count;
  }
  for (const [table, count] of Object.entries(raw.clickhouse?.tables ?? {})) {
    if (count > 0) {
      const key = table in deletedCounts ? `${table} (analytics)` : table;
      deletedCounts[key] = count;
    }
  }
  return {
    organizationId: raw.organization_id,
    dryRun: raw.dry_run,
    timestamp: raw.timestamp,
    deletedCounts,
    disabledJobCount: raw.disabled_jobs ?? 0,
    credentialDeletionCount: raw.credentials_deleted ?? 0,
    warnings: raw.warnings ?? [],
  };
}

export const orgsApi = {
  list: (token?: string, headerOrgId?: string) =>
    request<Organization[]>("/orgs", {}, token, headerOrgId),

  get: (orgId: string, token?: string, headerOrgId?: string) =>
    request<Organization>(`/orgs/${orgId}`, {}, token, headerOrgId),

  create: (data: OrganizationCreate, token?: string, headerOrgId?: string) =>
    request<Organization>(
      "/orgs",
      { method: "POST", body: JSON.stringify(data) },
      token,
      headerOrgId,
    ),

  update: (orgId: string, data: OrganizationUpdate, token?: string, headerOrgId?: string) =>
    request<Organization>(
      `/orgs/${orgId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
      headerOrgId,
    ),

  delete: (orgId: string, token?: string, headerOrgId?: string) =>
    request<void>(`/orgs/${orgId}`, { method: "DELETE" }, token, headerOrgId),

  dryRunDelete: async (
    orgId: string,
    token?: string,
    headerOrgId?: string,
  ): Promise<DeletionPlan> => {
    const raw = await request<DeletionResultRaw>(
      `/orgs/${orgId}?dry_run=true`,
      { method: "DELETE" },
      token,
      headerOrgId,
    );
    return normalizeDeletionResult(raw);
  },

  members: {
    list: (orgId: string, token?: string, headerOrgId?: string) =>
      request<Membership[]>(`/orgs/${orgId}/members`, {}, token, headerOrgId),

    add: (orgId: string, data: MembershipCreate, token?: string, headerOrgId?: string) =>
      request<Membership>(
        `/orgs/${orgId}/members`,
        { method: "POST", body: JSON.stringify(data) },
        token,
        headerOrgId,
      ),

    updateRole: (
      orgId: string,
      userId: string,
      data: MembershipUpdateRole,
      token?: string,
      headerOrgId?: string,
    ) =>
      request<Membership>(
        `/orgs/${orgId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify(data) },
        token,
        headerOrgId,
      ),

    remove: (orgId: string, userId: string, token?: string, headerOrgId?: string) =>
      request<void>(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" }, token, headerOrgId),

    transferOwnership: (
      orgId: string,
      newOwnerUserId: string,
      token?: string,
      headerOrgId?: string,
    ) =>
      request<void>(
        `/orgs/${orgId}/transfer-ownership`,
        {
          method: "POST",
          body: JSON.stringify({ new_owner_user_id: newOwnerUserId }),
        },
        token,
        headerOrgId,
      ),
  },
};
