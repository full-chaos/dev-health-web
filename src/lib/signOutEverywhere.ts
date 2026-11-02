import { signOut } from "next-auth/react";

import { acrBrowserSignOut, type AcrSignOutHook } from "@/lib/ask-dev/acr-sign-out";
import { forgetThreadHint } from "@/lib/ask-dev/conversationHint";
import { cancelLiveRunForSignOut } from "@/lib/ask-dev/signOutCancel";
import { logger } from "@/lib/logger";

/**
 * Sign-out (CHAOS-12096; Ask Dev direct-browser design §2.4, item T4). The order is fixed:
 *
 * 0. Cancel this tab's live Ask Dev runs at ACR while the tab still holds its ACR token
 *    (CHAOS-12574): with the run lease on, dropping the stream does not end ACR's run. Bounded by
 *    `SIGN_OUT_CANCEL_TIMEOUT_MS`; a cancel cut at that time, or one that fails, is logged.
 * 1. Revoke the Ops session, through this web server (`/api/auth/revoke-session`: the refresh
 *    token is in the sealed session, which the browser cannot read). Retried once. When it still
 *    fails, the next steps run anyway, the failure is logged as an error, and the sign-in page
 *    shows "Signed out on this device; other sessions may stay active".
 * 2. Revoke the ACR token family with its refresh token, at ACR's revocation endpoint (the browser
 *    calls ACR directly). Nothing is sent when the browser holds no family.
 * 3. Clear the ACR token state in every tab, and forget this tab's Ask Dev conversation (its
 *    restore hint, CHAOS-12575): the next session must not restore a conversation it cannot read.
 * 4. NextAuth `signOut()`: to the same place as before on success; to the sign-in page with the
 *    partial notice when step 1 failed.
 *
 * A failed step never stops a later one. No token or credential value is logged.
 */

export const SESSION_REVOKE_PATH = "/api/auth/revoke-session";
/** The sign-in page shows the partial sign-out notice for `signedOut=partial`. */
export const SIGNED_OUT_PARTIAL_REDIRECT = "/auth/signin?signedOut=partial";

const SESSION_REVOKE_ATTEMPTS = 2;
const STEP_TIMEOUT_MS = 8_000;
/** How long step 0 may hold the sign-out: one cancel round trip to ACR, with room. */
export const SIGN_OUT_CANCEL_TIMEOUT_MS = 3_000;

type LogFn = (fields: Record<string, unknown>, message: string) => void;

export type SignOutDeps = {
    /** Asks ACR to cancel this tab's live Ask Dev runs; it stops when `signal` aborts. */
    readonly cancelLiveRun: (signal: AbortSignal) => Promise<void>;
    readonly fetch: typeof fetch;
    /** Forgets this tab's Ask Dev conversation (its restore hint). */
    readonly forgetConversation: () => void;
    readonly hook: AcrSignOutHook;
    readonly log: { readonly error: LogFn; readonly info: LogFn; readonly warn: LogFn };
    /** No options: NextAuth's own default destination (unchanged from before). */
    readonly signOut: (options?: { readonly redirectTo: string }) => Promise<unknown>;
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
        cancelLiveRun: cancelLiveRunForSignOut,
        fetch: (input, init) => fetch(input, init),
        forgetConversation: forgetThreadHint,
        hook: acrBrowserSignOut,
        log: {
            error: (fields, message) => log.error(fields, message),
            info: (fields, message) => log.info(fields, message),
            warn: (fields, message) => log.warn(fields, message),
        },
        signOut: (options) =>
            options === undefined ? signOut() : signOut({ redirectTo: options.redirectTo }),
    };
}

/** Step 0 (CHAOS-12574): never throws, and never holds the sign-out past its timeout. */
async function cancelLiveRun(deps: SignOutDeps): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), SIGN_OUT_CANCEL_TIMEOUT_MS);
    });
    try {
        const ended = await Promise.race([
            deps.cancelLiveRun(controller.signal).then(() => "done" as const),
            timeout,
        ]);
        if (ended === "timeout") {
            controller.abort();
            deps.log.warn(
                { step: "ask_dev_run_cancel_timeout", timeoutMs: SIGN_OUT_CANCEL_TIMEOUT_MS },
                "sign-out: the live Ask Dev run cancel ran out of time; ACR may run it to its end",
            );
        }
    } catch (error) {
        deps.log.error(
            { errorName: errorName(error), step: "ask_dev_run_cancel" },
            "sign-out: cancelling the live Ask Dev run failed; ACR may run it to its end",
        );
    } finally {
        clearTimeout(timer);
    }
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
        // RFC 7009 form; the optional token_type_hint is left out (ACR finds the family by the token).
        const response = await deps.fetch(family.revocationEndpoint, {
            body: new URLSearchParams({
                client_id: family.clientId,
                token: family.refreshToken,
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

/** Step 3, this tab: its Ask Dev conversation (CHAOS-12575). */
function forgetConversation(deps: SignOutDeps): void {
    try {
        deps.forgetConversation();
    } catch (error) {
        deps.log.error(
            { errorName: errorName(error), step: "ask_dev_conversation_forget" },
            "sign-out: forgetting this tab's Ask Dev restore hint failed",
        );
    }
}

export async function signOutEverywhere(
    deps: SignOutDeps = defaultDeps(),
): Promise<SignOutOutcome> {
    await cancelLiveRun(deps);
    const sessionRevoked = await revokeOpsSession(deps);
    const familyRevoked = await revokeAcrFamily(deps);
    await clearAcrTokens(deps);
    forgetConversation(deps);
    deps.log.info(
        { familyRevoked, sessionRevoked, step: "next_auth_sign_out" },
        "sign-out: signing out of this device",
    );
    await deps.signOut(sessionRevoked ? undefined : { redirectTo: SIGNED_OUT_PARTIAL_REDIRECT });
    return { familyRevoked, sessionRevoked };
}
