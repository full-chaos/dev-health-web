import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AcrRuntimeError, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { readRequestJson } from "@/lib/acr/http";
import { validateAcrContract } from "@/lib/acr/contracts";
import { logger } from "@/lib/logger";
import {
    prepareInvestigation,
    streamRequest,
    type PreparedInvestigation,
} from "@/lib/ask-dev/investigation.server";
import {
    KEEPALIVE_FRAME,
    KEEPALIVE_INTERVAL_MS,
    MAX_STREAM_BYTES,
    errorFrame,
} from "@/lib/ask-dev/sse-frames";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 256 * 1_024;
const MAX_ERROR_BODY_BYTES = 64 * 1_024;
const encoder = new TextEncoder();

function failureBody(error: AcrRuntimeError, requestId: string): NextResponse {
    const headers: Record<string, string> = {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
    };
    if (error.retryAfterSeconds !== undefined) {
        headers["Retry-After"] = String(error.retryAfterSeconds);
    }
    return NextResponse.json(
        {
            error: {
                code: error.code,
                message: safeAcrRuntimeMessage(error.code),
                retryable: error.retryable,
                ...(error.retryAfterSeconds === undefined
                    ? {}
                    : { retryAfterSeconds: error.retryAfterSeconds }),
            },
            request_id: requestId,
        },
        { headers, status: error.status },
    );
}

function toRuntimeError(error: unknown): AcrRuntimeError {
    if (error instanceof AcrRuntimeError) return error;
    return new AcrRuntimeError("unavailable", "Agent Context Runtime is temporarily unavailable.", {
        cause: error,
        retryable: true,
    });
}

async function readBoundedErrorBody(response: Response): Promise<unknown> {
    try {
        const reader = response.body?.getReader();
        if (reader === undefined) return undefined;
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            received += next.value.byteLength;
            if (received > MAX_ERROR_BODY_BYTES) {
                await reader.cancel();
                return undefined;
            }
            chunks.push(next.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
        return undefined;
    }
}

function wireError(value: unknown): { code?: string; upstreamRequestId?: string } {
    if (!validateAcrContract("error.v1.schema.json", value).valid) return {};
    const record = value as { error?: { code?: unknown }; request_id?: unknown };
    return {
        ...(typeof record.error?.code === "string" ? { code: record.error.code } : {}),
        ...(typeof record.request_id === "string" ? { upstreamRequestId: record.request_id } : {}),
    };
}

function retryAfter(response: Response): number | undefined {
    const raw = response.headers.get("retry-after");
    if (raw === null) return undefined;
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Streams the run to the browser. The first byte (a keepalive comment) is written before ACR
 * answers, and a keepalive follows every 10 s, so no hop sees a silent connection. Bytes from ACR
 * are relayed unchanged; a failure after this point is a terminal `error` frame, because the
 * status line has already been sent. Browser abort aborts ACR.
 */
function relay(prepared: PreparedInvestigation, requestId: string, browser: AbortSignal): Response {
    const upstreamAbort = new AbortController();
    const abort = (): void => upstreamAbort.abort();
    // A browser that left while the request was being prepared never gets an abort event.
    if (browser.aborted) upstreamAbort.abort();
    else browser.addEventListener("abort", abort, { once: true });
    let keepalive: ReturnType<typeof setInterval> | undefined;

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            const write = (text: string): void => {
                try {
                    controller.enqueue(encoder.encode(text));
                } catch {
                    // The browser went away; the abort listener stops ACR.
                }
            };
            write(KEEPALIVE_FRAME);
            // A keepalive is dropped while the browser is not reading: a stalled client must
            // not grow the queue without bound.
            keepalive = setInterval(() => {
                if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
                write(KEEPALIVE_FRAME);
            }, KEEPALIVE_INTERVAL_MS);
            const fail = (error: AcrRuntimeError, code: string = error.code): void => {
                logger.warn(
                    { request_id: requestId, code, status: error.status },
                    "ask-dev investigation failed after the stream opened",
                );
                write(
                    errorFrame({
                        code,
                        message: safeAcrRuntimeMessage(error.code),
                        requestId,
                        retryable: error.retryable,
                        retryAfterSeconds: error.retryAfterSeconds,
                    }),
                );
            };
            try {
                if (upstreamAbort.signal.aborted) return;
                const response = await prepared.client.openInvestigationStream(
                    streamRequest(prepared, { requestId, signal: upstreamAbort.signal }),
                );
                if (!response.ok) {
                    const upstream = wireError(await readBoundedErrorBody(response));
                    logger.warn(
                        {
                            request_id: requestId,
                            upstream_request_id: upstream.upstreamRequestId,
                            status: response.status,
                            wire_code: upstream.code,
                        },
                        "ask-dev investigation refused by ACR",
                    );
                    fail(
                        prepared.client.investigationFailure(
                            response.status,
                            upstream.code,
                            retryAfter(response),
                        ),
                        // 406 is the stream-off answer (plan 2.7.1). The pinned error.v1 enum has no
                        // `stream_unavailable` code yet, so the status decides.
                        response.status === 406 ? "stream_unavailable" : undefined,
                    );
                    return;
                }
                const contentType = response.headers.get("content-type") ?? "";
                if (!contentType.startsWith("text/event-stream") || response.body === null) {
                    // No JSON fallback in the product path.
                    fail(
                        new AcrRuntimeError(
                            "malformed_response",
                            "Agent Context Runtime returned an invalid response.",
                        ),
                        "invalid_upstream",
                    );
                    upstreamAbort.abort();
                    return;
                }
                const reader = response.body.getReader();
                let received = 0;
                for (;;) {
                    const next = await reader.read();
                    if (next.done) break;
                    received += next.value.byteLength;
                    if (received > MAX_STREAM_BYTES) {
                        upstreamAbort.abort();
                        fail(
                            new AcrRuntimeError(
                                "response_too_large",
                                "Agent Context Runtime returned an oversized response.",
                            ),
                            "invalid_upstream",
                        );
                        return;
                    }
                    controller.enqueue(next.value);
                }
            } catch (error) {
                if (browser.aborted) return;
                fail(toRuntimeError(error));
            } finally {
                clearInterval(keepalive);
                browser.removeEventListener("abort", abort);
                try {
                    controller.close();
                } catch {
                    // Already closed by the browser's cancel.
                }
            }
        },
        cancel() {
            clearInterval(keepalive);
            upstreamAbort.abort();
        },
    });

    return new Response(body, {
        headers: {
            "Cache-Control": "no-store, no-transform",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Accel-Buffering": "no",
            "X-Request-ID": requestId,
        },
        status: 200,
    });
}

export async function POST(request: Request): Promise<Response> {
    const requestId = randomUUID();
    try {
        const prepared = await prepareInvestigation({
            body: await readRequestJson(request, MAX_REQUEST_BYTES),
            signal: request.signal,
            submissionId: request.headers.get("x-acr-submission-id"),
            threadId: request.headers.get("x-acr-thread-id"),
        });
        return relay(prepared, requestId, request.signal);
    } catch (error) {
        const runtimeError = toRuntimeError(error);
        logger.warn(
            { request_id: requestId, code: runtimeError.code, status: runtimeError.status },
            "ask-dev investigation denied before the stream opened",
        );
        return failureBody(runtimeError, requestId);
    }
}
