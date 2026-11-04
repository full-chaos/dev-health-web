"use server";

import { adminApi, AdminApiError } from "../api";
import { UserFacingActionError } from "@/lib/actionFailure";
import type { ActionResult } from "@/lib/result";
import { ORG_MEMBER_ROLES, USER_CREATE_ROLES } from "../types";
import { withOrgMemberRefusals } from "../orgMemberErrors";
import type {
    Organization,
    OrganizationCreate,
    OrganizationUpdate,
    Membership,
    OrgMemberRole,
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
            throw new AdminApiError(response.status, response.statusText, detail, "GET");
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
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const { token, orgId } = await getSessionContext();
            if (!orgId) {
                throw new AdminApiError(400, "Bad Request", "No organization ID in session");
            }
            return adminApi.orgs.update(orgId, data, token, orgId);
        }),
    );
}

/**
 * Self-service org profile update — calls /api/v1/orgs/me (non-admin endpoint)
 * so that org owners/admins can update name & description without superuser.
 */
export async function updateOrgProfile(data: {
    name?: string;
    description?: string | null;
}): Promise<ActionResult<Organization>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const { token, orgId } = await getSessionContext();
            if (!orgId) {
                throw new AdminApiError(400, "Bad Request", "No organization ID in session");
            }
            return adminApi.orgs.updateProfile(data, token, orgId);
        }),
    );
}

export async function deleteCurrentOrg(): Promise<ActionResult<void>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const { token, orgId } = await getSessionContext();
            if (!orgId) {
                throw new AdminApiError(400, "Bad Request", "No organization ID in session");
            }
            return adminApi.orgs.delete(orgId, token, orgId);
        }),
    );
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
        const token = await requireSuperuserToken({
            action: "admin.impersonate",
            guard: "unmapped",
        });
        return adminApi.impersonation.start(targetUserId, token);
    }, "changes-impersonation");
}

export async function stopImpersonation(): Promise<ActionResult<{ status: string }>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({
            action: "admin.impersonate",
            allowImpersonating: true,
            guard: "unmapped",
        });
        return adminApi.impersonation.stop(token);
    }, "changes-impersonation");
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
        const token = await requireSuperuserToken({
            action: "admin.impersonate",
            allowImpersonating: true,
            guard: "unmapped",
        });
        return adminApi.impersonation.status(token);
    });
}

// ---- Superadmin: Organization Management ----

export async function listOrganizations(): Promise<ActionResult<Organization[]>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({ action: "admin.orgs" });
        return adminApi.orgs.list(token);
    });
}

export async function getOrganization(orgId: string): Promise<ActionResult<Organization>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({ action: "admin.orgs" });
        return adminApi.orgs.get(orgId, token);
    });
}

export async function createOrganization(
    data: OrganizationCreate,
): Promise<ActionResult<Organization>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const token = await requireSuperuserToken({ action: "admin.orgs" });
            return adminApi.orgs.create(data, token);
        }),
    );
}

export async function updateOrganization(
    orgId: string,
    data: OrganizationUpdate,
): Promise<ActionResult<Organization>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const token = await requireSuperuserToken({ action: "admin.orgs" });
            return adminApi.orgs.update(orgId, data, token);
        }),
    );
}

export async function deleteOrganization(orgId: string): Promise<ActionResult<void>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const token = await requireSuperuserToken({ action: "admin.orgs" });
            return adminApi.orgs.delete(orgId, token);
        }),
    );
}

export async function dryRunDeleteOrganization(orgId: string): Promise<ActionResult<DeletionPlan>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({ action: "admin.orgs" });
        return adminApi.orgs.dryRunDelete(orgId, token);
    });
}

export async function listOrgMembers(orgId: string): Promise<ActionResult<Membership[]>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({ action: "admin.orgs" });
        return adminApi.orgs.members.list(orgId, token);
    });
}

function requireMemberRole(role: string): OrgMemberRole {
    if (!(ORG_MEMBER_ROLES as readonly string[]).includes(role)) {
        throw new AdminApiError(422, "Unprocessable Entity", `Unknown role "${role}"`);
    }
    return role as OrgMemberRole;
}

/** Adds an existing user, found by exact email, to an organization. */
export async function addOrgMemberByEmail(
    orgId: string,
    email: string,
    role: string,
): Promise<ActionResult<Membership>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const token = await requireSuperuserToken({ action: "admin.orgs" });
            const memberRole = requireMemberRole(role);
            const wanted = email.trim().toLowerCase();
            if (!wanted) {
                throw new AdminApiError(422, "Unprocessable Entity", "Email is required");
            }
            const candidates = await adminApi.users.list(token, undefined, wanted);
            const user = candidates.find((u) => u.email.toLowerCase() === wanted);
            if (!user) {
                throw new UserFacingActionError(404, `No user with email ${email.trim()}`);
            }
            return adminApi.orgs.members.add(orgId, { user_id: user.id, role: memberRole }, token);
        }),
    );
}

export async function changeOrgMemberRole(
    orgId: string,
    userId: string,
    role: string,
): Promise<ActionResult<Membership>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(async () => {
            const token = await requireSuperuserToken({ action: "admin.orgs" });
            const memberRole = requireMemberRole(role);
            return adminApi.orgs.members.updateRole(orgId, userId, { role: memberRole }, token);
        }),
    );
}

export async function getPlatformStats(): Promise<ActionResult<PlatformStats>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken({ action: "admin.stats" });
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
        const token = await requireSuperuserToken({ action: "admin.audit" });
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

// ---- Remove, transfer and invite (appended: the auth-profile anchors above stay put) ----

/** Removes a member; the server decides whether the owner rules allow it. */
export async function removeOrgMember(orgId: string, userId: string): Promise<ActionResult<void>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(
            async () => {
                const token = await requireSuperuserToken();
                return adminApi.orgs.members.remove(orgId, userId, token);
            },
            { closed: true },
        ),
    );
}

export async function transferOrgOwnership(
    orgId: string,
    newOwnerUserId: string,
): Promise<ActionResult<void>> {
    return withErrorHandling(() =>
        withOrgMemberRefusals(
            async () => {
                const token = await requireSuperuserToken();
                return adminApi.orgs.members.transferOwnership(orgId, newOwnerUserId, token);
            },
            { closed: true },
        ),
    );
}

type CreatedOrgInvite = Awaited<ReturnType<typeof adminApi.orgs.invites.create>>;

// An invite never carries owner: ownership moves only through a transfer.
function inviteBody(email: string, role: string) {
    if (!(USER_CREATE_ROLES as readonly string[]).includes(role)) {
        throw new AdminApiError(422, "Unprocessable Entity", `Unknown role "${role}"`);
    }
    const wanted = email.trim().toLowerCase();
    if (!wanted) {
        throw new AdminApiError(422, "Unprocessable Entity", "Email is required");
    }
    return { email: wanted, role };
}

export async function inviteOrgMember(
    orgId: string,
    email: string,
    role: string,
): Promise<ActionResult<CreatedOrgInvite>> {
    return withErrorHandling(() => {
        const body = inviteBody(email, role);
        return withOrgMemberRefusals(
            async () => {
                const token = await requireSuperuserToken();
                return adminApi.orgs.invites.create(orgId, body, token);
            },
            { closed: true },
        );
    });
}

/** Invites into the signed-in organization; the org comes from the session, never from the caller. */
export async function inviteCurrentOrgMember(
    email: string,
    role: string,
): Promise<ActionResult<CreatedOrgInvite>> {
    return withErrorHandling(() => {
        const body = inviteBody(email, role);
        return withOrgMemberRefusals(
            async () => {
                const { token, orgId } = await getSessionContext();
                if (!orgId) {
                    throw new AdminApiError(400, "Bad Request", "No organization ID in session");
                }
                return adminApi.orgs.invites.create(orgId, body, token, orgId);
            },
            { closed: true },
        );
    });
}
