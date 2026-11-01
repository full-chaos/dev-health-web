import { NextResponse } from "next/server";

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { readRequestJson } from "@/lib/acr/http";
import { authorizeAskDevBrowser, type AskDevAuthorizeFailure } from "@/lib/acr/service";
import { isSameOriginRequest } from "@/lib/ask-dev/origin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ module: "ask-dev-authorize-route" });

/** The body is two fixed-size values: anything near this is not one. */
const MAX_REQUEST_BYTES = 1_024;
/** A PKCE S256 challenge or a state: 32 bytes, base64url, no padding. */
const RANDOM_43 = /^[A-Za-z0-9_-]{43}$/u;

/** Each failure's status, and whether its log line is an error: something is wrong, not refused. */
const FAILURES: Readonly<
    Record<AskDevAuthorizeFailure, { readonly status: number; readonly loud?: true }>
> = {
    client_off: { status: 404 },
    impersonating: { status: 403 },
    not_entitled: { status: 403 },
    rate_limited: { status: 429 },
    acr_refused: { status: 502 },
    acr_unavailable: { status: 503 },
    bad_location: { status: 502, loud: true },
    bad_redirect: { status: 502, loud: true },
    consent_review: { status: 502, loud: true },
};

/** One line per request: an enum and a status. Never a code, a state, a handle, a URL or an id. */
function logOutcome(outcome: string, status: number, loud = false): void {
    if (loud) log.error({ outcome, status }, "ask-dev authorize");
    else log.info({ outcome, status }, "ask-dev authorize");
}

function failure(code: string, status: number, retryAfterSeconds?: number): NextResponse {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (retryAfterSeconds !== undefined) headers["Retry-After"] = String(retryAfterSeconds);
    return NextResponse.json({ error: { code } }, { headers, status });
}

/** Exactly `{code_challenge, state}`: the verifier, a client or a redirect are not this route's. */
function parseBody(value: unknown): { codeChallenge: string; state: string } | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const body = value as Record<string, unknown>;
    if (Object.keys(body).sort().join() !== "code_challenge,state") return null;
    const { code_challenge: codeChallenge, state } = body;
    if (typeof codeChallenge !== "string" || !RANDOM_43.test(codeChallenge)) return null;
    if (typeof state !== "string" || !RANDOM_43.test(state)) return null;
    return { codeChallenge, state };
}

/**
 * The silent step of Ask Dev's ACR authorization (CHAOS-12474; design amendment in
 * `docs/ask-dev.md`). Same origin only. From the signed-in session it runs ACR's `/authorize` and
 * its first-party consent, and answers the code as JSON, `no-store`. The browser stays the OAuth
 * public client, with the verifier and the `/token` exchange, so this is not a data proxy.
 */
export async function POST(request: Request): Promise<NextResponse> {
    if (!isSameOriginRequest(request)) {
        logOutcome("origin_refused", 403);
        return failure("origin_refused", 403);
    }
    let body: { codeChallenge: string; state: string } | null;
    try {
        body = parseBody(await readRequestJson(request, MAX_REQUEST_BYTES));
    } catch {
        body = null;
    }
    if (body === null) {
        logOutcome("invalid_request", 400);
        return failure("invalid_request", 400);
    }
    try {
        const answer = await authorizeAskDevBrowser({ ...body, signal: request.signal });
        if (answer.kind === "refused") {
            const { status, loud } = FAILURES[answer.reason];
            logOutcome(answer.reason, status, loud);
            return failure(answer.reason, status, answer.retryAfterSeconds);
        }
        logOutcome("authorized", 200);
        return NextResponse.json(
            { code: answer.code, state: answer.state, iss: answer.iss },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.unauthenticated
        ) {
            logOutcome("signed_out", 401);
            return failure("signed_out", 401);
        }
        // The error may hold a URL: its name stays out of the log too.
        logOutcome("unhandled", 503, true);
        return failure("acr_unavailable", 503);
    }
}
