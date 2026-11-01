import { NextResponse } from "next/server";

import { readSessionCredentialsForSignOut } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { revokeSessionAtAuthService } from "@/lib/authServiceWire";
import { getServerEnv } from "@/lib/config";
import { getBackendUrl } from "@/lib/origin";

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
    const env = getServerEnv();
    const revoked = await revokeSessionAtAuthService(
        { access: session.access_token, refresh: session.refresh_token },
        {
            tokenClassRaw: env.AUTH_ACCESS_TOKEN_CLASS,
            issuer: env.AUTH_ACCESS_TOKEN_ISSUER,
            backendUrl: getBackendUrl(),
        },
    );
    if (revoked.kind !== "revoked") {
        routeLogger.error(
            { outcome: "ops_refused", userId: session.user_id },
            "sign-out session revoke FAILED: Ops logout did not answer 200",
        );
        return failure(502, "revoke_failed");
    }
    routeLogger.info({ outcome: "revoked", userId: session.user_id }, "sign-out session revoked");
    return new NextResponse(null, { headers: { "Cache-Control": "no-store" }, status: 204 });
}
