import { signOut } from "next-auth/react";

import { acrBrowserSignOut, type AcrSignOutHook } from "@/lib/ask-dev/acr-sign-out";
import { logger } from "@/lib/logger";

/**
 * Sign-out (CHAOS-12096; Ask Dev direct-browser design §2.4, item T4). The order is fixed:
 *
 * 1. Revoke the Ops session, through this web server (`/api/auth/revoke-session`: the refresh
 *    token is in the sealed session, which the browser cannot read). Retried once. When it still
 *    fails, the next steps run anyway, the failure is logged as an error, and the sign-in page
 *    shows "Signed out on this device; other sessions may stay active".
 * 2. Revoke the ACR token family with its refresh token, at ACR's revocation endpoint (the browser
 *    calls ACR directly). Nothing is sent when the browser holds no family.
 * 3. Clear the ACR token state in every tab.
 * 4. NextAuth `signOut()`.
 *
 * A failed step never stops a later one. No token or credential value is logged.
 */

export const SESSION_REVOKE_PATH = "/api/auth/revoke-session";
export const SIGNED_OUT_REDIRECT = "/auth/signin";
/** The sign-in page shows the partial sign-out notice for `signedOut=partial`. */
export const SIGNED_OUT_PARTIAL_REDIRECT = "/auth/signin?signedOut=partial";

const SESSION_REVOKE_ATTEMPTS = 2;
const STEP_TIMEOUT_MS = 8_000;

type LogFn = (fields: Record<string, unknown>, message: string) => void;

export type SignOutDeps = {
    readonly fetch: typeof fetch;
    readonly hook: AcrSignOutHook;
    readonly log: { readonly error: LogFn; readonly info: LogFn; readonly warn: LogFn };
    readonly signOut: (options: { readonly redirectTo: string }) => Promise<unknown>;
};

export type SignOutOutcome = {
    readonly sessionRevoked: boolean;
    /** null: the browser held no ACR family, so nothing was sent. */
    readonly familyRevoked: boolean | null;
};

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
}

function defaultDeps(): SignOutDeps {
    const log = logger.child({ module: "sign-out" });
    return {
        fetch: (input, init) => fetch(input, init),
        hook: acrBrowserSignOut,
        log: {
            error: (fields, message) => log.error(fields, message),
            info: (fields, message) => log.info(fields, message),
            warn: (fields, message) => log.warn(fields, message),
        },
        signOut: (options) => signOut({ redirectTo: options.redirectTo }),
    };
}

/** Step 1: true when the web server answered 204 (Ops revoked the session). */
async function revokeOpsSession(deps: SignOutDeps): Promise<boolean> {
    let last: Record<string, unknown> = {};
    for (let attempt = 1; attempt <= SESSION_REVOKE_ATTEMPTS; attempt += 1) {
        try {
            const response = await deps.fetch(SESSION_REVOKE_PATH, {
                cache: "no-store",
                credentials: "same-origin",
                method: "POST",
                signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
            });
            if (response.status === 204) return true;
            last = { attempt, status: response.status };
        } catch (error) {
            last = { attempt, errorName: errorName(error) };
        }
        deps.log.warn(
            { step: "ops_session_revoke", ...last },
            "sign-out: Ops session revoke failed",
        );
    }
    deps.log.error(
        { attempts: SESSION_REVOKE_ATTEMPTS, step: "ops_session_revoke", ...last },
        "sign-out: the Ops session was NOT revoked after a retry; other sessions may stay active",
    );
    return false;
}

/** Step 2: null when no family is held; otherwise whether ACR answered 200. */
async function revokeAcrFamily(deps: SignOutDeps): Promise<boolean | null> {
    let family: ReturnType<AcrSignOutHook["heldFamily"]>;
    try {
        family = deps.hook.heldFamily();
    } catch (error) {
        deps.log.error(
            { errorName: errorName(error), step: "acr_family_read" },
            "sign-out: the ACR token family could not be read; it is not revoked",
        );
        return false;
    }
    if (family === null) return null;
    try {
        const response = await deps.fetch(family.revocationEndpoint, {
            body: new URLSearchParams({
                client_id: family.clientId,
                token: family.refreshToken,
                token_type_hint: "refresh_token",
            }).toString(),
            cache: "no-store",
            credentials: "omit",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
        });
        if (response.ok) return true;
        deps.log.error(
            { status: response.status, step: "acr_family_revoke" },
            "sign-out: ACR refused the token family revoke",
        );
    } catch (error) {
        deps.log.error(
            { errorName: errorName(error), step: "acr_family_revoke" },
            "sign-out: the ACR token family revoke failed",
        );
    }
    return false;
}

/** Step 3. */
async function clearAcrTokens(deps: SignOutDeps): Promise<void> {
    try {
        await deps.hook.clearAllTabs();
    } catch (error) {
        deps.log.error(
            { errorName: errorName(error), step: "acr_tokens_clear" },
            "sign-out: clearing the ACR tokens of the tabs failed",
        );
    }
}

export async function signOutEverywhere(
    deps: SignOutDeps = defaultDeps(),
): Promise<SignOutOutcome> {
    const sessionRevoked = await revokeOpsSession(deps);
    const familyRevoked = await revokeAcrFamily(deps);
    await clearAcrTokens(deps);
    deps.log.info(
        { familyRevoked, sessionRevoked, step: "next_auth_sign_out" },
        "sign-out: signing out of this device",
    );
    await deps.signOut({
        redirectTo: sessionRevoked ? SIGNED_OUT_REDIRECT : SIGNED_OUT_PARTIAL_REDIRECT,
    });
    return { familyRevoked, sessionRevoked };
}
