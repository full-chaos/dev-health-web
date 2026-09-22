import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { toConsentDecisionWire } from "@/lib/acr/consent-wire";
import { decideOAuthConsent, previewOAuthConsent } from "@/lib/acr/service";
import { AcrRuntimeError, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { getClientIp, isTrustProxyEnabled } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ module: "acr-authorize-route" });

const GENERAL_LIMIT = {
    failClosed: true,
    maxRequests: 20,
    namespace: "acr-authorize-general",
    windowMs: 60_000,
};
const HANDLE_LIMIT = {
    failClosed: true,
    maxRequests: 10,
    namespace: "acr-authorize-handle",
    windowMs: 60_000,
};

type ConsentAction = "approve" | "deny" | "preview";
type ConsentRequest = Readonly<Record<string, unknown>>;

function safeError(error: AcrRuntimeError): NextResponse {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (error.retryAfterSeconds !== undefined) {
        headers["Retry-After"] = String(error.retryAfterSeconds);
    }
    return NextResponse.json(
        {
            error: {
                code: error.code,
                message: safeAcrRuntimeMessage(error.code),
                retryable: error.retryable,
                ...(error.retryAfterSeconds !== undefined
                    ? { retryAfterSeconds: error.retryAfterSeconds }
                    : {}),
            },
        },
        { headers, status: error.status },
    );
}

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

function asScopeList(value: unknown): readonly string[] | undefined {
    if (!Array.isArray(value) || !value.every((scope) => typeof scope === "string"))
        return undefined;
    return value;
}

function asHandle(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function asAction(value: unknown): ConsentAction | undefined {
    return value === "preview" || value === "approve" || value === "deny" ? value : undefined;
}

async function parseBody(request: Request): Promise<ConsentRequest | undefined> {
    try {
        const value: unknown = await request.json();
        return typeof value === "object" && value !== null && !Array.isArray(value)
            ? Object.freeze({ ...value })
            : undefined;
    } catch {
        return undefined;
    }
}

function limitedResponse(retryAfter: number): NextResponse {
    return NextResponse.json(
        { error: { code: "rate_limited", message: "Please try again later." } },
        {
            headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
            status: 429,
        },
    );
}

/**
 * Logs one line per outcome for this route. Fields are deliberately limited
 * to `action`/`outcome`/`status` — the handle, the OAuth `code`, the
 * `redirect_url` and the signed assertion never reach the logger.
 */
function logOutcome(action: ConsentAction | undefined, outcome: string, status: number): void {
    log.info({ action, outcome, status }, "acr oauth authorize consent");
}

export async function POST(request: Request): Promise<NextResponse> {
    if (requestOrigin(request) !== expectedOrigin(request)) {
        logOutcome(undefined, "origin_mismatch", 403);
        return NextResponse.json(
            { error: { code: "forbidden", message: "Request rejected." } },
            { status: 403 },
        );
    }
    const clientIp = getClientIp(request, {
        trustProxy: isTrustProxyEnabled(process.env.TRUST_PROXY),
    });
    const general = await checkRateLimit(clientIp, GENERAL_LIMIT);
    if (general.limited) {
        logOutcome(undefined, "rate_limited_general", 429);
        return limitedResponse(general.retryAfter);
    }
    const body = await parseBody(request);
    const handle = asHandle(body?.["handle"]);
    const action = asAction(body?.["action"]);
    if (!handle || !action) {
        logOutcome(action, "invalid_request", 400);
        return NextResponse.json(
            { error: { code: "invalid_request", message: "Request rejected." } },
            { status: 400 },
        );
    }
    const handleFingerprint = createHash("sha256").update(handle).digest("hex");
    const handleAttempt = await checkRateLimit(`${clientIp}:${handleFingerprint}`, HANDLE_LIMIT);
    if (handleAttempt.limited) {
        logOutcome(action, "rate_limited_handle", 429);
        return limitedResponse(handleAttempt.retryAfter);
    }
    try {
        if (action === "preview") {
            const preview = await previewOAuthConsent({ handle, signal: request.signal });
            logOutcome(action, "success", 200);
            return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
        }
        const repositoryScopes =
            action === "approve" ? asScopeList(body?.["repository_scopes"]) : undefined;
        if (action === "approve" && !repositoryScopes) {
            logOutcome(action, "invalid_request", 400);
            return NextResponse.json(
                { error: { code: "invalid_request", message: "Request rejected." } },
                { status: 400 },
            );
        }
        const decision = await decideOAuthConsent({
            action,
            handle,
            ...(repositoryScopes ? { repositoryScopes } : {}),
            signal: request.signal,
        });
        logOutcome(action, "success", 200);
        return NextResponse.json(toConsentDecisionWire(decision), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        if (error instanceof AcrRuntimeError) {
            logOutcome(action, "acr_error", error.status);
            return safeError(error);
        }
        logOutcome(action, "unhandled_error", 503);
        log.error({ err: error }, "acr oauth authorize consent unhandled error");
        return NextResponse.json(
            { error: { code: "unavailable", message: "Approval is temporarily unavailable." } },
            { headers: { "Cache-Control": "no-store" }, status: 503 },
        );
    }
}
