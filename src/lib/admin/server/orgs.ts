"use server";

import { adminApi, AdminApiError } from "../api";
import type { ActionResult } from "@/lib/result";
import type {
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
  Membership,
  PlatformStats,
  AuditLogListResponse,
  AuditLogFilter,
  DeletionPlan,
} from "../types";
import { getSessionContext, requireSuperuserToken, withErrorHandling } from "./_shared";

// ---- Current Org (self-service) ----

export async function getCurrentOrg(): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    const baseUrl = (await import("@/lib/origin")).getBackendUrl();
    const response = await fetch(`${baseUrl}/api/v1/orgs/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Org-Id": orgId,
      },
      cache: "no-store",
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

    const org = (await response.json()) as Partial<Organization>;
    return {
      id: String(org.id),
      slug: String(org.slug),
      name: String(org.name),
      description: org.description ?? null,
      tier: String(org.tier ?? "community"),
      settings: org.settings ?? {},
      is_active: org.is_active ?? true,
      created_at: org.created_at ?? "",
      updated_at: org.updated_at ?? "",
    } satisfies Organization;
  });
}

export async function updateCurrentOrg(
  data: OrganizationUpdate,
): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.update(orgId, data, token, orgId);
  });
}

/**
 * Self-service org profile update — calls /api/v1/orgs/me (non-admin endpoint)
 * so that org owners/admins can update name & description without superuser.
 */
export async function updateOrgProfile(data: {
  name?: string;
  description?: string | null;
}): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }

    const baseUrl = (await import("@/lib/origin")).getBackendUrl();
    const response = await fetch(`${baseUrl}/api/v1/orgs/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Org-Id": orgId,
      },
      body: JSON.stringify(data),
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

    return (await response.json()) as Organization;
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

export async function dryRunDeleteCurrentOrg(): Promise<ActionResult<DeletionPlan>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    if (!orgId) {
      throw new AdminApiError(400, "Bad Request", "No organization ID in session");
    }
    return adminApi.orgs.dryRunDelete(orgId, token, orgId);
  });
}

// ---- Impersonation ----

export async function startImpersonation(targetUserId: string): Promise<
  ActionResult<{
    status: string;
    target_user: { id: string; email: string; org_id: string; role: string };
    expires_at: string;
  }>
> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.impersonation.start(targetUserId, token);
  });
}

export async function stopImpersonation(): Promise<ActionResult<{ status: string }>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.impersonation.stop(token);
  });
}

export async function getImpersonationStatus(): Promise<
  ActionResult<{
    is_impersonating: boolean;
    target_user_id: string | null;
    target_email: string | null;
    target_org_id: string | null;
    expires_at: string | null;
  }>
> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.impersonation.status(token);
  });
}

// ---- Superadmin: Organization Management ----

export async function listOrganizations(): Promise<ActionResult<Organization[]>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.list(token);
  });
}

export async function getOrganization(orgId: string): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.get(orgId, token);
  });
}

export async function createOrganization(
  data: OrganizationCreate,
): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.create(data, token);
  });
}

export async function updateOrganization(
  orgId: string,
  data: OrganizationUpdate,
): Promise<ActionResult<Organization>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.update(orgId, data, token);
  });
}

export async function deleteOrganization(orgId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.delete(orgId, token);
  });
}

export async function dryRunDeleteOrganization(orgId: string): Promise<ActionResult<DeletionPlan>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.dryRunDelete(orgId, token);
  });
}

export async function listOrgMembers(orgId: string): Promise<ActionResult<Membership[]>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.orgs.members.list(orgId, token);
  });
}

export async function getPlatformStats(): Promise<ActionResult<PlatformStats>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.platform.stats(token);
  });
}

// ---- Audit Logs ----

export async function listPlatformAuditLogs(
  filters?: AuditLogFilter,
  limit?: number,
  offset?: number,
): Promise<ActionResult<AuditLogListResponse>> {
  return withErrorHandling(async () => {
    const token = await requireSuperuserToken();
    return adminApi.platformAudit.list(filters, limit, offset, token);
  });
}

export async function listAuditLogs(
  filters?: AuditLogFilter,
  limit?: number,
  offset?: number,
): Promise<ActionResult<AuditLogListResponse>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.audit.list(filters, limit ?? 50, offset ?? 0, token, orgId);
  });
}

export async function getAuditLog(
  id: string,
): Promise<ActionResult<AuditLogListResponse["items"][0]>> {
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
