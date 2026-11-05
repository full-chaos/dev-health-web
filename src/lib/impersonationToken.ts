import type { JWT } from "next-auth/jwt";

import { impersonationApi } from "@/lib/admin/api/platform";
import type { RefreshResult } from "@/lib/authServiceWire";
import { logger } from "@/lib/logger";

const impersonationLogger = logger.child({ module: "impersonation" });

/** ACP-ADR-03 bounds a delegated session at 15 minutes; a longer `expires_in` is cut to it. */
export const MAX_DELEGATED_SECONDS = 15 * 60;

/**
 * The delegated token of an impersonation. The administrator's own token pair is never replaced:
 * stop and status are refused 403 for a delegated bearer, so they carry the administrator token.
 * The delegated token lives in the `imp_*` fields of the session JWT, set only from a sealed
 * handoff and dropped together.
 */

// The delegated service token (aud auth-service) is not kept: it would take about 1 KB of the
// session cookie (CHAOS-13105 byte budget) and no auth-service route is used while impersonating.
export type ImpersonationPair = {
    access_token: string;
    expires_in?: number;
};

export function setImpersonationToken(token: JWT, pair: ImpersonationPair, now: number): void {
    token.imp_access_token = pair.access_token;
    token.imp_expires_at =
        now + Math.min(pair.expires_in ?? MAX_DELEGATED_SECONDS, MAX_DELEGATED_SECONDS) * 1000;
}

export function clearImpersonationToken(token: JWT): void {
    token.imp_access_token = undefined;
    token.imp_expires_at = undefined;
}

/**
 * The one guard of the token pair while an impersonation is live (delegated token or status
 * flag set). Only the administrator's own refresh rotates the pair. A handoff of another kind is
 * refused: an org switch or a password change made under the delegated bearer answers with the
 * target's pair. A sign-in starts a new session, so the delegated state is dropped first.
 */
export function admitPairWrite<H extends { kind: string }>(
    token: JWT,
    handoff: H | null,
    signIn: boolean,
): H | null {
    if (!token.imp_access_token && !token.is_impersonating) return handoff;
    if (signIn) {
        dropImpersonation(token);
        return handoff;
    }
    return handoff?.kind === "impersonation" ? handoff : null;
}

/** Before the end of an administrator token, the refresh starts this early (the callback's rule). */
export const ADMIN_REFRESH_LEAD_MS = 5 * 60 * 1000;

/** True when a delegated token is held and has run out (a missing expiry counts as run out). */
export function delegatedExpired(token: JWT, now: number): boolean {
    if (!token.imp_access_token) return false;
    return token.imp_expires_at === undefined || now >= token.imp_expires_at;
}

function adminBearerLive(token: JWT, now: number): boolean {
    if (typeof token.access_token !== "string" || !token.access_token) return false;
    const expiresAt = token.expires_at as number | undefined;
    return expiresAt === undefined || now < expiresAt;
}

async function stopWith(adminBearer: string): Promise<boolean> {
    try {
        await impersonationApi.stop(adminBearer);
        return true;
    } catch {
        return false;
    }
}

// The `sid` claim of the delegated token is the wire form ("ses_" + base64url of the 16 bytes) of
// the delegated session id, the id of auth-service's session row and audit row. Read without a
// check, for the log line only: no decision is made on it.
function delegationIdsOf(accessToken: unknown): { sid?: string; delegation_id?: string } {
    if (typeof accessToken !== "string") return {};
    const payload = accessToken.split(".")[1];
    if (!payload) return {};
    let sid: unknown;
    try {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
        sid = (claims as { sid?: unknown } | null)?.sid;
    } catch {
        return {};
    }
    if (typeof sid !== "string") return {};
    const bytes = sid.startsWith("ses_") ? Buffer.from(sid.slice(4), "base64url") : undefined;
    if (!bytes || bytes.length !== 16) return { sid };
    const hex = bytes.toString("hex");
    return {
        sid,
        delegation_id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    };
}

function dropImpersonation(token: JWT): void {
    clearImpersonationToken(token);
    token.is_impersonating = false;
    token.impersonated_user_id = undefined;
    token.impersonated_email = undefined;
    token.impersonated_org_id = undefined;
}

/**
 * The session ends while a delegated token is held. A live administrator bearer stops the row
 * first; without one, or when the stop fails, one error event says the stop was not recorded (the
 * server row then ends at its own expiry). The delegated state is dropped either way.
 */
export async function endImpersonationForSignOut(token: JWT, now: number): Promise<void> {
    if (!token.imp_access_token) return;
    const stopped = adminBearerLive(token, now) && (await stopWith(token.access_token as string));
    if (!stopped) {
        impersonationLogger.error(
            {
                event: "impersonation_stop_not_recorded",
                ...delegationIdsOf(token.imp_access_token),
                user_id: token.id,
                target_user_id: token.impersonated_user_id,
                org_id: token.impersonated_org_id,
            },
            "impersonation stop not recorded",
        );
    }
    dropImpersonation(token);
}

type Rotated = Extract<RefreshResult, { kind: "rotated" }>;

export type ImpersonationStep =
    /** No delegated token, or a live one: nothing to do. */
    | { kind: "none" }
    /** The stop answered 2xx and the delegated fields are gone. */
    | { kind: "stopped"; refreshed?: RefreshResult }
    /** The stop failed: the fields stay (no bearer is served) and the next request retries. */
    | { kind: "kept"; refreshed?: RefreshResult }
    /** No live administrator bearer: the session is ended (tokens dropped). */
    | { kind: "ended" };

/**
 * The first step of the JWT callback: an expired delegated token is stopped with a live
 * administrator bearer, never the delegated one. When the administrator token is missing, expired
 * or near its end, its pair is refreshed here first; a rotated pair is written at once, any other
 * outcome is handed back (`refreshed`) for the callback's own refresh branches, which then do not
 * call again. With no live bearer the session ends. Never throws.
 */
export async function resolveImpersonationStep(
    token: JWT,
    now: number,
    admin: { refresh: () => Promise<RefreshResult>; applyRotated: (r: Rotated) => void },
): Promise<ImpersonationStep> {
    if (!delegatedExpired(token, now)) return { kind: "none" };
    let live = adminBearerLive(token, now);
    const expiresAt = token.expires_at as number | undefined;
    const near = live && expiresAt !== undefined && now > expiresAt - ADMIN_REFRESH_LEAD_MS;
    let refreshed: RefreshResult | undefined;
    if ((!live || near) && token.refresh_token) {
        const answer = await admin
            .refresh()
            .catch((): RefreshResult => ({ kind: "transient", errorName: "step_refresh_threw" }));
        if (answer.kind === "rotated") {
            admin.applyRotated(answer);
            live = adminBearerLive(token, now);
        } else {
            refreshed = answer;
        }
    }
    if (!live) {
        await endImpersonationForSignOut(token, now);
        token.access_token = undefined;
        token.refresh_token = undefined;
        token.session_access_token = undefined;
        token.session_expires_at = undefined;
        token.act_sub = undefined;
        token.error = "refresh_failed";
        return { kind: "ended" };
    }
    if (await stopWith(token.access_token as string)) {
        clearImpersonationToken(token);
        return { kind: "stopped", refreshed };
    }
    return { kind: "kept", refreshed };
}
