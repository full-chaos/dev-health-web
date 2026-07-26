import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { approveDeviceAuthorization, previewDeviceAuthorization } from "@/lib/acr/service";
import { AcrRuntimeError, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { getClientIp, isTrustProxyEnabled } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GENERAL_LIMIT = {
    failClosed: true,
    maxRequests: 20,
    namespace: "acr-device-general",
    windowMs: 60_000,
};
const CODE_LIMIT = {
    failClosed: true,
    maxRequests: 5,
    namespace: "acr-device-code",
    windowMs: 60_000,
};

type ApprovalRequest = Readonly<Record<string, unknown>>;

function safeError(error: AcrRuntimeError): NextResponse {
    return NextResponse.json(
        {
            error: {
                code: error.code,
                message: safeAcrRuntimeMessage(error.code),
                retryable: error.retryable,
            },
        },
        { headers: { "Cache-Control": "no-store" }, status: error.status },
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

function asUserCode(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

async function parseBody(request: Request): Promise<ApprovalRequest | undefined> {
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

export async function POST(request: Request): Promise<NextResponse> {
    if (requestOrigin(request) !== expectedOrigin(request)) {
        return NextResponse.json(
            { error: { code: "forbidden", message: "Request rejected." } },
            { status: 403 },
        );
    }
    const clientIp = getClientIp(request, {
        trustProxy: isTrustProxyEnabled(process.env.TRUST_PROXY),
    });
    const general = await checkRateLimit(clientIp, GENERAL_LIMIT);
    if (general.limited) return limitedResponse(general.retryAfter);
    const body = await parseBody(request);
    const userCode = asUserCode(body?.["user_code"]);
    const action = body?.["action"];
    if (!userCode || (action !== "preview" && action !== "approve")) {
        return NextResponse.json(
            { error: { code: "invalid_request", message: "Request rejected." } },
            { status: 400 },
        );
    }
    const codeFingerprint = createHash("sha256").update(userCode).digest("hex");
    const codeAttempt = await checkRateLimit(`${clientIp}:${codeFingerprint}`, CODE_LIMIT);
    if (codeAttempt.limited) return limitedResponse(codeAttempt.retryAfter);
    try {
        if (action === "preview") {
            const preview = await previewDeviceAuthorization({
                signal: request.signal,
                userCode,
            });
            return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
        }
        const repositoryScopes = asScopeList(body?.["repository_scopes"]);
        if (!repositoryScopes) {
            return NextResponse.json(
                { error: { code: "invalid_request", message: "Request rejected." } },
                { status: 400 },
            );
        }
        const approval = await approveDeviceAuthorization({
            repositoryScopes,
            signal: request.signal,
            userCode,
        });
        return NextResponse.json(approval, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        if (error instanceof AcrRuntimeError) return safeError(error);
        return NextResponse.json(
            { error: { code: "unavailable", message: "Approval is temporarily unavailable." } },
            { headers: { "Cache-Control": "no-store" }, status: 503 },
        );
    }
}
