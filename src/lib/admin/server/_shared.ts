import { failureFromError } from "@/lib/actionFailure";
import { auth, forgetOwnImpersonationStatus } from "@/lib/auth";
import { AdminApiError } from "../api";
import type { ActionResult } from "@/lib/result";

export interface SessionContext {
    token: string;
    orgId: string | undefined;
}

export async function getSessionContext(): Promise<SessionContext> {
    const session = await auth();
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

export async function requireSuperuserToken(): Promise<string> {
    const session = await auth();
    if (!session?.access_token) {
        throw new AdminApiError(401, "Unauthorized", "No access token");
    }
    if (!session.user?.is_superuser) {
        throw new AdminApiError(403, "Forbidden", "Superuser access required");
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
