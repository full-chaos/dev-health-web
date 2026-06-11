/**
 * Org-scope resolution that is impersonation-aware.
 *
 * During an active impersonation session the backend scopes all data access
 * to the impersonation TARGET org (see CHAOS-2303: impersonation context
 * takes precedence over the admin's JWT org). The frontend must mirror that
 * precedence: a superuser who is also a member of an organization has a
 * `session.user.org_id` of their own, and forwarding it as the org scope
 * (`X-Org-Id` header / GraphQL `orgId` variable) while impersonating causes
 * the backend org-scope guard to reject every query
 * ("Access denied: cannot query data for org ...").
 */

export interface OrgScopedUser {
    org_id?: string;
    is_impersonating?: boolean;
    impersonated_org_id?: string;
}

/**
 * Returns the org id the current session should scope data access to.
 *
 * - Active impersonation → the impersonation target's org.
 * - Otherwise → the user's own org (may be undefined for org-less superusers).
 */
export function resolveActiveOrgId(user: OrgScopedUser | undefined | null): string | undefined {
    if (!user) return undefined;
    if (user.is_impersonating && user.impersonated_org_id) {
        return user.impersonated_org_id;
    }
    return user.org_id;
}
