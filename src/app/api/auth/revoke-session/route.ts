import { NextResponse } from "next/server";

import { readSessionCredentialsForSignOut } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";
import { deadlineFetch } from "@/lib/serverDeadline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const routeLogger = logger.child({ module: "revoke-session" });

/**
 * Sign-out step 1 (CHAOS-12096; Ask Dev direct-browser design §2.4, item T4): revoke the signed-in
 * user's Ops session. The page calls this before NextAuth's own signOut().
 *
 * The Ops refresh token is in the sealed session cookie, which the browser cannot read, so this
 * server sends it: Ops `POST /api/v1/auth/logout` revokes the session that credential belongs to
 * (auth-service's session store once the session aggregate is routed to it; the legacy refresh
 * token before). After it, the session's `sid` is no longer live, so every credential bound to it
 * (ACR browser tokens included) is refused at its next live check.
 *
 * 204 = Ops revoked it. 401 = no session to revoke. 403 = not this site. 502 = Ops failed. The
 * page retries once and signs out either way. No answer and no log line carries a token.
 */

function requestOrigin(request: Request): string | undefined {
    const origin = request.headers.get("origin");
    if (origin === null) return undefined;
    try {
        return new URL(origin).origin;
    } catch {
        return undefined;
    }
}

function expectedOrigin(request: Request): string {
    const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    if (configured !== undefined) {
        try {
            return new URL(configured).origin;
        } catch {
            return "";
        }
    }
    return new URL(request.url).origin;
}

function failure(status: number, code: string): NextResponse {
    return NextResponse.json({ error: code }, { headers: { "Cache-Control": "no-store" }, status });
}

export async function POST(request: Request): Promise<NextResponse> {
    if (requestOrigin(request) !== expectedOrigin(request)) {
        routeLogger.warn({ outcome: "origin_mismatch" }, "sign-out session revoke refused");
        return failure(403, "forbidden");
    }
    // The sealed session's Ops tokens; null unless it holds both (an inline reject the auth-profile
    // gate recognizes: `if (!session?.access_token) return`).
    const session = await readSessionCredentialsForSignOut(request);
    if (!session?.access_token) {
        routeLogger.warn(
            { outcome: "no_session" },
            "sign-out session revoke: no session to revoke",
        );
        return failure(401, "no_session");
    }
    let response: Response;
    try {
        response = await deadlineFetch("auth")(`${getBackendUrl()}/api/v1/auth/logout`, {
            body: JSON.stringify({ refresh_token: session.refresh_token }),
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
            },
            method: "POST",
        });
    } catch (error) {
        routeLogger.error(
            {
                errorName: error instanceof Error ? error.name : typeof error,
                outcome: "ops_unreachable",
                userId: session.user_id,
            },
            "sign-out session revoke FAILED: Ops logout call failed",
        );
        return failure(502, "revoke_failed");
    }
    if (!response.ok) {
        routeLogger.error(
            { outcome: "ops_refused", status: response.status, userId: session.user_id },
            "sign-out session revoke FAILED: Ops logout refused",
        );
        return failure(502, "revoke_failed");
    }
    routeLogger.info({ outcome: "revoked", userId: session.user_id }, "sign-out session revoked");
    return new NextResponse(null, { headers: { "Cache-Control": "no-store" }, status: 204 });
}
