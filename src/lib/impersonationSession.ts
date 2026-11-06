import "server-only";
import { UserFacingActionError } from "@/lib/actionFailure";
import { auth, sealSessionHandoff, signOut } from "@/lib/auth";
import { impersonationApi } from "@/lib/admin/api/platform";
import { logger } from "@/lib/logger";

const impersonationLogger = logger.child({ module: "impersonation" });

export const NO_DELEGATED_TOKEN_MESSAGE =
    "Impersonation needs the delegated token. It was stopped.";

// The delegated token of the start answer never reaches the browser; it travels as a sealed handoff.

export type StartAnswer = Awaited<ReturnType<typeof impersonationApi.start>>;
export type StartResult = Omit<
    StartAnswer,
    "access_token" | "session_access_token" | "token_type" | "expires_in" | "handoff_id"
> & { sessionHandoff?: string };

/**
 * The start answer for the browser: the old members and a sealed handoff of the delegated token.
 * The delegated token is the only impersonation state (D6720): an answer without one (the
 * administrator bearer impersonating, AUTH_PROXY_IMPERSONATION off) is stopped at once with the
 * administrator bearer and refused. When that stop fails, the user is signed out (fail closed).
 */
export async function startResultWithHandoff(answer: StartAnswer): Promise<StartResult> {
    // A delegated token has no refresh path: a refresh token in the answer is never passed on.
    // The delegated service token is not kept either (ImpersonationPair).
    const {
        access_token,
        session_access_token,
        expires_in,
        token_type,
        refresh_token,
        handoff_id,
        ...rest
    } = answer as StartAnswer & { refresh_token?: unknown };
    void session_access_token;
    void token_type;
    void refresh_token;
    const session = await auth();
    if (typeof access_token !== "string" || !access_token) {
        await stopStartWithoutDelegatedToken(session, rest, "start_without_delegated_token");
        throw new UserFacingActionError(409, NO_DELEGATED_TOKEN_MESSAGE);
    }
    // The handoff is admitted only through go-api's one-use record of this start (CHAOS-13184).
    if (typeof handoff_id !== "string" || !handoff_id) {
        await stopStartWithoutDelegatedToken(session, rest, "start_without_handoff_id");
        throw new UserFacingActionError(409, NO_DELEGATED_TOKEN_MESSAGE);
    }
    const userId = session?.user?.id;
    if (!userId) throw new Error("no signed-in user to bind the impersonation handoff to");
    const sessionHandoff = await sealSessionHandoff(
        "impersonation",
        {
            access_token,
            expires_in: typeof expires_in === "number" ? expires_in : undefined,
            handoff_id,
        },
        userId,
    );
    return { ...rest, sessionHandoff };
}

export type StopAnswer = Awaited<ReturnType<typeof impersonationApi.stop>>;

/**
 * The stop answer for the browser, plus a sealed end handoff naming the delegated token the stop
 * ended: the session drops it even when the status read that follows fails.
 */
export async function stopResultWithHandoff(
    answer: StopAnswer,
): Promise<StopAnswer & { sessionHandoff?: string }> {
    const session = await auth();
    const userId = session?.user?.id;
    const delegated = session?.admin_access_token ? session.access_token : undefined;
    if (!userId || !delegated) return answer;
    const sessionHandoff = await sealSessionHandoff(
        "impersonationEnd",
        { access_token: delegated },
        userId,
    );
    return { ...answer, sessionHandoff };
}

async function stopStartWithoutDelegatedToken(
    session: Awaited<ReturnType<typeof auth>>,
    answer: Omit<StartResult, "sessionHandoff">,
    reason: "start_without_delegated_token" | "start_without_handoff_id",
): Promise<void> {
    const adminBearer = session?.access_token;
    if (adminBearer) {
        try {
            await impersonationApi.stop(adminBearer);
            return;
        } catch {
            // Logged below; the session ends.
        }
    }
    impersonationLogger.error(
        {
            event: "impersonation_stop_not_recorded",
            reason,
            user_id: session?.user?.id,
            target_user_id: answer.target_user?.id,
            org_id: answer.target_user?.org_id,
        },
        "impersonation stop not recorded",
    );
    await signOut({ redirect: false });
}
