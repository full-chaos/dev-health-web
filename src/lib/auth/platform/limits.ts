import "server-only";
import type { Session } from "next-auth";
import { getServerEnv } from "@/lib/config";
import { readImpersonationStatus } from "@/lib/impersonationStatusMemo";
import { logger } from "@/lib/logger";
import type { OrgDeniedAction } from "./actionTable";
import { PLATFORM_UI_SWITCH, platformUiMode } from "./mode";

// Impersonation limits of the platform-admin UI, only with AUTHZ_PLATFORM_UI=enforce. Off and
// shadow return "no limit" before any read, so those modes behave as before.

export const IMPERSONATION_DENY_PATH = "/impersonation-restricted";
export const IMPERSONATION_LIMIT_MESSAGE = "Not available while impersonating";

export type ImpersonationLimitCause = "impersonating" | "status_unknown";

export function platformUiEnforced(): boolean {
    return platformUiMode(getServerEnv()[PLATFORM_UI_SWITCH.name]) === "enforce";
}

/**
 * Why the session is limited, or null. Only a superuser can impersonate, so only a superuser
 * session reads the server status (the shared 3 s memo the jwt callback also reads). The status
 * decides, not a flag the client holds; no status (a failed read, or its wait) is a limit.
 */
export async function impersonationLimit(
    session: Session,
): Promise<ImpersonationLimitCause | null> {
    if (!platformUiEnforced()) return null;
    if (session.user?.is_impersonating === true) return "impersonating";
    if (session.user?.is_superuser !== true) return null;
    if (!session.access_token) return "status_unknown";
    try {
        const status = await readImpersonationStatus({
            userId: session.user.id,
            accessToken: session.access_token,
            force: false,
            now: Date.now(),
        });
        if (status === undefined) return "status_unknown";
        return status.is_impersonating ? "impersonating" : null;
    } catch {
        return "status_unknown";
    }
}

export async function impersonationLimited(session: Session): Promise<boolean> {
    return (await impersonationLimit(session)) !== null;
}

/** True when the org write must be refused; writes one log line (no token, user or org id). */
export async function refuseOrgWrite(session: Session, action: OrgDeniedAction): Promise<boolean> {
    const cause = await impersonationLimit(session);
    if (cause === null) return false;
    logger.info({ action, cause, surface: "org_write" }, "impersonation_limit");
    return true;
}
