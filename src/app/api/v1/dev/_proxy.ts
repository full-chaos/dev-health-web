import "server-only";

import { auth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/origin";

export const DEV_JSON_LIMIT = 2 * 1024 * 1024;
export const DEV_MUTATION_LIMIT = 32 * 1024;
export const DEV_STREAM_LIMIT = 16 * 1024 * 1024;

export type DevWebError = Readonly<{
    schema_version: "dev_web_error.v1";
    code: string;
    safe_message: string;
    retryable: boolean;
    request_id?: string;
    limit_reset_at?: string;
}>;

type ProxyOptions = Readonly<{
    mutation?: boolean;
    requestLimit?: number;
    stream?: boolean;
}>;

const NO_STORE_HEADERS = {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
} as const;

const DEV_ROUTE_ORIGIN = "https://ask-dev-route.invalid";

function devUpstreamUrl(upstreamPath: string): URL | null {
    const route = new URL(upstreamPath, DEV_ROUTE_ORIGIN);
    if (
        route.origin !== DEV_ROUTE_ORIGIN ||
        (route.pathname !== "/api/v1/dev" && !route.pathname.startsWith("/api/v1/dev/"))
    ) {
        return null;
    }

    const upstream = new URL(getBackendUrl());
    upstream.pathname = route.pathname;
    upstream.search = route.search;
    upstream.hash = "";
    return upstream;
}

function webError(
    status: number,
    code: string,
    safeMessage: string,
    retryable = false,
    requestId?: string,
    limitResetAt?: string,
): Response {
    const error: DevWebError = {
        schema_version: "dev_web_error.v1",
        code,
        safe_message: safeMessage,
        retryable,
        ...(requestId ? { request_id: requestId } : {}),
        ...(limitResetAt ? { limit_reset_at: limitResetAt } : {}),
    };
    return Response.json(error, { status, headers: NO_STORE_HEADERS });
}

function expectedOrigin(request: Request): string {
    const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    try {
        return configured ? new URL(configured).origin : new URL(request.url).origin;
    } catch {
        return "";
    }
}

function hasValidMutationOrigin(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return false;
    try {
        return new URL(origin).origin === expectedOrigin(request);
    } catch {
        return false;
    }
}

async function boundedBody(request: Request, limit: number): Promise<Uint8Array | undefined> {
    if (!request.body) return undefined;
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > limit)
        throw new RangeError("too large");

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
            await reader.cancel();
            throw new RangeError("too large");
        }
        chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

async function boundedResponseBody(response: Response, limit: number): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
            await reader.cancel();
            throw new RangeError("too large");
        }
        chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

function safeUpstreamError(
    payload: unknown,
): Pick<DevWebError, "code" | "safe_message" | "retryable" | "request_id" | "limit_reset_at"> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {
            code: "upstream_error",
            safe_message: "Ask Dev is temporarily unavailable.",
            retryable: true,
        };
    }
    const value = payload as Record<string, unknown>;
    return {
        code: typeof value.code === "string" ? value.code : "upstream_error",
        safe_message:
            typeof value.safe_message === "string"
                ? value.safe_message
                : "Ask Dev is temporarily unavailable.",
        retryable: value.retryable === true,
        ...(typeof value.request_id === "string" ? { request_id: value.request_id } : {}),
        ...(typeof value.limit_reset_at === "string"
            ? { limit_reset_at: value.limit_reset_at }
            : {}),
    };
}

function boundedStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    let transferred = 0;
    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                transferred += chunk.byteLength;
                if (transferred > DEV_STREAM_LIMIT) {
                    controller.error(new RangeError("Ask Dev stream exceeded its byte limit."));
                    return;
                }
                controller.enqueue(chunk);
            },
        }),
    );
}

export async function proxyDevRequest(
    request: Request,
    upstreamPath: string,
    options: ProxyOptions = {},
): Promise<Response> {
    if (options.mutation && !hasValidMutationOrigin(request)) {
        return webError(403, "forbidden", "Request rejected.");
    }
    const session = await auth();
    if (!session?.access_token) {
        return webError(401, "unauthenticated", "Authentication is required for Ask Dev.");
    }

    let body: Uint8Array | undefined;
    try {
        body = await boundedBody(request, options.requestLimit ?? DEV_MUTATION_LIMIT);
    } catch (error) {
        if (error instanceof RangeError) {
            return webError(413, "payload_too_large", "The Ask Dev request is too large.");
        }
        return webError(400, "invalid_request", "The Ask Dev request is invalid.");
    }

    const headers = new Headers({ Authorization: `Bearer ${session.access_token}` });
    const contentType = request.headers.get("content-type");
    const requestId = request.headers.get("x-request-id");
    if (contentType) headers.set("Content-Type", contentType);
    if (requestId) headers.set("X-Request-ID", requestId);

    let upstream: Response;
    try {
        const upstreamUrl = devUpstreamUrl(upstreamPath);
        if (!upstreamUrl) {
            return webError(400, "invalid_request", "The Ask Dev request is invalid.");
        }
        upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers,
            body: body
                ? (body.buffer.slice(
                      body.byteOffset,
                      body.byteOffset + body.byteLength,
                  ) as ArrayBuffer)
                : undefined,
            cache: "no-store",
            signal: request.signal,
        });
    } catch {
        return webError(503, "upstream_unavailable", "Ask Dev is temporarily unavailable.", true);
    }

    if (!upstream.ok) {
        let payload: unknown;
        try {
            const raw = await boundedResponseBody(upstream, 64 * 1024);
            payload = JSON.parse(new TextDecoder().decode(raw));
        } catch {
            payload = undefined;
        }
        const safe = safeUpstreamError(payload);
        const response = webError(
            upstream.status,
            safe.code,
            safe.safe_message,
            safe.retryable,
            safe.request_id,
            safe.limit_reset_at,
        );
        const retryAfter = upstream.headers.get("retry-after");
        if (retryAfter) response.headers.set("Retry-After", retryAfter);
        return response;
    }

    if (options.stream) {
        if (
            !upstream.headers.get("content-type")?.startsWith("text/event-stream") ||
            !upstream.body
        ) {
            return webError(
                502,
                "invalid_upstream_response",
                "Ask Dev returned an invalid response.",
            );
        }
        return new Response(boundedStream(upstream.body), {
            status: upstream.status,
            headers: { ...NO_STORE_HEADERS, "Content-Type": "text/event-stream; charset=utf-8" },
        });
    }

    try {
        const responseBody = await boundedResponseBody(upstream, DEV_JSON_LIMIT);
        const responseHeaders = new Headers(NO_STORE_HEADERS);
        const upstreamContentType = upstream.headers.get("content-type");
        if (upstreamContentType) responseHeaders.set("Content-Type", upstreamContentType);
        const responsePayload = responseBody.byteLength
            ? (responseBody.buffer.slice(
                  responseBody.byteOffset,
                  responseBody.byteOffset + responseBody.byteLength,
              ) as ArrayBuffer)
            : null;
        return new Response(responsePayload, {
            status: upstream.status,
            headers: responseHeaders,
        });
    } catch {
        return webError(502, "invalid_upstream_response", "Ask Dev returned an invalid response.");
    }
}
