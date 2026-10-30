import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { AcrRuntimeClient } from "@/lib/acr/client";
import { loadAcrRuntimeConfig } from "@/lib/acr/config";
import { AcrRuntimeError, acrRuntimeErrorCodes, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { resolveAskDevAuthorization, type OpsAuthorization } from "@/lib/acr/ops";
import { sessionOrError } from "@/lib/acr/service";
import { logger } from "@/lib/logger";
import { SETUP_STEP_MAX_MS } from "./deadline";

/** Longest a read-only Ask Dev call takes end to end (setup reads plus the ACR read). */
export const READ_TIMEOUT_MS = 30_000;

/** An id in a path: the ACR path-parameter alphabet. Anything else is "not found", never a 400. */
const ID_PATTERN = /^[A-Za-z0-9._:-]{8,256}$/u;

export type PreparedRead = {
    readonly authorization: OpsAuthorization;
    readonly client: AcrRuntimeClient;
};

export function notFound(): AcrRuntimeError {
    return new AcrRuntimeError(
        acrRuntimeErrorCodes.repositoryNotAvailable,
        "The requested context is not available.",
        { status: 404 },
    );
}

/** The id as given, or a 404: a malformed id is answered like an unknown one (no oracle). */
export function pathIdOrNotFound(value: string, maxLength: number): string {
    if (value.length > maxLength || !ID_PATTERN.test(value)) throw notFound();
    return value;
}

/**
 * The per-call auth chain of a read-only Ask Dev route. It runs on EVERY request and nothing it
 * learns is cached (North Star check 18): a session with an access token, an org and a subject
 * (else 401); BOTH entitlements `agent_context_runtime` and `ask_dev`, read fresh from ops (off or
 * revoked: 403); the caller's repository scopes, read fresh from ops. A fresh single-use assertion
 * is signed when the ACR read is sent. Impersonation is allowed: a replay or a status read starts
 * no run (plan D-16), and it reads as the session's own org and subject.
 */
export async function prepareRead(signal: AbortSignal): Promise<PreparedRead> {
    const session = sessionOrError(await auth());
    const authorization = await resolveAskDevAuthorization({
        accessToken: session.accessToken,
        orgId: session.orgId,
        signal,
        stepTimeoutMs: () => SETUP_STEP_MAX_MS,
        subject: session.subject,
    });
    return { authorization, client: new AcrRuntimeClient(loadAcrRuntimeConfig()) };
}

function toRuntimeError(error: unknown): AcrRuntimeError {
    if (error instanceof AcrRuntimeError) return error;
    return new AcrRuntimeError("unavailable", "Agent Context Runtime is temporarily unavailable.", {
        cause: error,
        retryable: true,
    });
}

export function readFailure(
    error: unknown,
    requestId: string,
    route: string,
    ids: Readonly<Record<string, string>>,
): NextResponse {
    const failure = toRuntimeError(error);
    logger.warn(
        { request_id: requestId, route, code: failure.code, status: failure.status, ...ids },
        "ask-dev read refused",
    );
    return NextResponse.json(
        {
            error: {
                code: failure.code,
                message: safeAcrRuntimeMessage(failure.code),
                retryable: failure.retryable,
                ...(failure.retryAfterSeconds === undefined
                    ? {}
                    : { retryAfterSeconds: failure.retryAfterSeconds }),
            },
            request_id: requestId,
        },
        {
            headers: {
                "Cache-Control": "no-store",
                "X-Request-ID": requestId,
                ...(failure.retryAfterSeconds === undefined
                    ? {}
                    : { "Retry-After": String(failure.retryAfterSeconds) }),
            },
            status: failure.status,
        },
    );
}

export function readSuccess(value: unknown, requestId: string): NextResponse {
    return NextResponse.json(value, {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
        status: 200,
    });
}

export function newRequestId(): string {
    return randomUUID();
}

export function readSignal(request: Request): AbortSignal {
    return AbortSignal.any([request.signal, AbortSignal.timeout(READ_TIMEOUT_MS)]);
}
