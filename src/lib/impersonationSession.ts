import "server-only";
import { auth, sealSessionHandoff } from "@/lib/auth";
import type { impersonationApi } from "@/lib/admin/api/platform";

// The delegated token of the start answer never reaches the browser; it travels as a sealed handoff.

export type StartAnswer = Awaited<ReturnType<typeof impersonationApi.start>>;
export type StartResult = Omit<
    StartAnswer,
    "access_token" | "session_access_token" | "token_type" | "expires_in"
> & { sessionHandoff?: string };

/** The start answer for the browser: the old members, plus a sealed handoff when a token came. */
export async function startResultWithHandoff(answer: StartAnswer): Promise<StartResult> {
    // A delegated token has no refresh path: a refresh token in the answer is never passed on.
    const { access_token, session_access_token, expires_in, token_type, refresh_token, ...rest } =
        answer as StartAnswer & { refresh_token?: unknown };
    void token_type;
    void refresh_token;
    if (typeof access_token !== "string" || !access_token) return rest;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new Error("no signed-in user to bind the impersonation handoff to");
    const sessionHandoff = await sealSessionHandoff(
        "impersonation",
        {
            access_token,
            session_access_token:
                typeof session_access_token === "string" && session_access_token
                    ? session_access_token
                    : undefined,
            expires_in: typeof expires_in === "number" ? expires_in : undefined,
        },
        userId,
    );
    return { ...rest, sessionHandoff };
}
