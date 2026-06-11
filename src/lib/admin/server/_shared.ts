import { auth } from "@/lib/auth";
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

export async function withErrorHandling<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        const data = await fn();
        return { data };
    } catch (err) {
        if (err instanceof AdminApiError) {
            const detail = err.detail || err.message;
            return { error: typeof detail === "string" ? detail : JSON.stringify(detail) };
        }
        return { error: err instanceof Error ? err.message : "Unknown error" };
    }
}
