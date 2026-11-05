import "server-only";
import type { Session } from "next-auth";
import { getServerEnv } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { OrgDeniedAction } from "./actionTable";
import { PLATFORM_UI_SWITCH, platformUiMode } from "./mode";

// Impersonation limits of the platform-admin UI, only with AUTHZ_PLATFORM_UI=enforce. Off and
// shadow return "no limit" before any read, so those modes behave as before.

export const IMPERSONATION_DENY_PATH = "/impersonation-restricted";
export const IMPERSONATION_LIMIT_MESSAGE = "Not available while impersonating";

export type ImpersonationLimitCause = "impersonating";

export function platformUiEnforced(): boolean {
    return platformUiMode(getServerEnv()[PLATFORM_UI_SWITCH.name]) === "enforce";
}

/**
 * Why the session is limited, or null. The session field is computed by the session callback from
 * the delegated token fields alone (D6720); the status read never decides here, so a failed read
 * changes nothing. Unreadable delegated fields count as impersonating (fail closed in the accessor).
 */
export async function impersonationLimit(
    session: Session,
): Promise<ImpersonationLimitCause | null> {
    if (!platformUiEnforced()) return null;
    return session.user?.is_impersonating === true ? "impersonating" : null;
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
