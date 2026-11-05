import { failureFromError } from "@/lib/actionFailure";
import { auth, forgetOwnImpersonationStatus } from "@/lib/auth";
import { decideGuard, defaultDeps, type GuardId } from "@/lib/auth/decide/decide";
import type { OrgDeniedAction, PlatformAction } from "@/lib/auth/platform/actionTable";
import { scheduleFnShadow } from "@/lib/auth/platform/shadow";
import { AdminApiError } from "../api";
import type { ActionResult } from "@/lib/result";

export interface SessionContext {
    token: string;
    orgId: string | undefined;
}

export async function getSessionContext(o: OrgWrite = {}): Promise<SessionContext> {
    const session = await authForOrgWrite(o.write);
    if (!session?.access_token) {
        throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    return {
        token: session.access_token,
        orgId: session.user?.org_id || undefined,
    };
}

export async function getToken(): Promise<string> {
    const ctx = await getSessionContext();
    return ctx.token;
}

/**
 * A session that impersonates keeps is_superuser, so it is refused here: a platform action must
 * not run as the impersonated user. Only the end and the status read of an impersonation pass
 * `allowImpersonating`.
 *
 * `guard` names the policy decision of the action (default `platform.orgs`). With
 * AUTHZ_DECISIONS_ENFORCE off the client superuser rule decides, as before. With it on the order
 * is: no token 401, impersonating 403, then the decision point alone (a deny or a failure is 403).
 * The guard is an option, not a second helper: the auth-profile gate anchors the action files by
 * line, so those files get no new import line.
 */
export async function requireSuperuserToken(opts: {
    action: PlatformAction;
    allowImpersonating?: true;
    guard?: GuardId;
}): Promise<string> {
    const session = await auth();
    if (!session?.access_token) {
        throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    scheduleFnShadow(session, opts.action, opts.allowImpersonating === true);
    const impersonating =
        session.user?.is_impersonating === true && opts.allowImpersonating !== true;
    const deps = defaultDeps();
    if (deps.enforced && impersonating) {
        throw new AdminApiError(403, "Forbidden", "Not available while impersonating");
    }
    const verdict = await decideGuard(session, opts.guard ?? "platform.orgs", deps);
    if (!verdict.allowed) {
        throw new AdminApiError(403, "Forbidden", verdict.message);
    }
    if (impersonating) {
        throw new AdminApiError(403, "Forbidden", "Not available while impersonating");
    }
    return session.access_token;
}

/**
 * `after: "changes-impersonation"` is for the actions that start or stop an impersonation: when
 * the call has ended, with a result or with an error (the backend may have applied the change),
 * the kept impersonation status of the signed-in user is dropped, so the next session read of
 * that user asks the backend again (CHAOS-9218). It is an argument, not a second helper: the
 * auth-profile gate anchors the action files by line, so those files get no new import line.
 */
export async function withErrorHandling<T>(
    fn: () => Promise<T>,
    after?: "changes-impersonation",
): Promise<ActionResult<T>> {
    try {
        const data = await fn();
        return { data };
    } catch (err) {
        return failureFromError("adminServerCall", err);
    } finally {
        if (after === "changes-impersonation") await forgetOwnImpersonationStatus();
    }
}

// Below the anchored lines on purpose: the auth-profile gate anchors this file by line.
import { IMPERSONATION_LIMIT_MESSAGE, refuseOrgWrite } from "@/lib/auth/platform/limits";

/**
 * `getSessionContext({ write })` names the catalog action of an organization write. With
 * AUTHZ_PLATFORM_UI=enforce a session that is impersonating (or whose status is unknown) is
 * refused with 403 before any backend call. No session token keeps the 401 of the caller.
 */
type OrgWrite = { write?: OrgDeniedAction };

async function authForOrgWrite(write: OrgDeniedAction | undefined) {
    const session = await auth();
    if (write !== undefined && session?.access_token && (await refuseOrgWrite(session, write))) {
        throw new AdminApiError(403, "Forbidden", IMPERSONATION_LIMIT_MESSAGE);
    }
    return session;
}
