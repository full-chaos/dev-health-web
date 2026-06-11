/**
 * Org-scope resolution that is impersonation-aware.
 *
 * During an active impersonation session the backend scopes all data access
 * to the impersonation TARGET org (see CHAOS-2303: impersonation context
 * takes precedence over the admin's JWT org). The frontend mirrors that
 * precedence CENTRALLY: the NextAuth `session()` callback (src/lib/auth.ts)
 * assigns `session.user.org_id = resolveActiveOrgId(...)`, so every consumer
 * (proxy, GraphQL providers, RSC fetchers) sees the effective org without
 * per-call-site checks. The admin's own org remains available as
 * `session.user.real_org_id` for identity-semantic checks (e.g. the
 * superadmin sidebar's org-admin access).
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
