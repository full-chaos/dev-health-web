import type { JWT } from "next-auth/jwt";

import { impersonationApi } from "@/lib/admin/api/platform";

/**
 * The delegated token of an impersonation. The administrator's own token pair is never replaced:
 * stop and status are refused 403 for a delegated bearer, so they carry the administrator token.
 * The delegated token lives in the `imp_*` fields of the session JWT, set only from a sealed
 * handoff and dropped together.
 */

export type ImpersonationPair = {
    access_token: string;
    session_access_token?: string;
    expires_in?: number;
};

export function setImpersonationToken(token: JWT, pair: ImpersonationPair, now: number): void {
    token.imp_access_token = pair.access_token;
    token.imp_session_access_token = pair.session_access_token;
    token.imp_expires_at = now + (pair.expires_in ?? 900) * 1000;
}

export function clearImpersonationToken(token: JWT): void {
    token.imp_access_token = undefined;
    token.imp_session_access_token = undefined;
    token.imp_expires_at = undefined;
}

/**
 * The delegated token ran out while the row may still be open. The row is ended with the
 * administrator token; only a stop that answered 2xx drops the fields. A failed stop keeps them,
 * so every request stays on the (expired) delegated token and is refused: never a silent fall
 * back to the administrator token. The next poll retries.
 */
export async function endExpiredImpersonation(token: JWT, now: number): Promise<boolean> {
    if (!token.imp_access_token || !token.access_token) return false;
    if (token.imp_expires_at !== undefined && now < token.imp_expires_at) return false;
    try {
        await impersonationApi.stop(token.access_token);
    } catch {
        return false;
    }
    clearImpersonationToken(token);
    return true;
}
