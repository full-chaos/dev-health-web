import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AcrRuntimeError, acrRuntimeErrorCodes, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { readRequestJson } from "@/lib/acr/http";
import { validateAcrContract } from "@/lib/acr/contracts";
import { logger } from "@/lib/logger";
import { isSameOriginRequest } from "@/lib/ask-dev/origin";
import { RunDeadline, STALL_MS, resolveRunTimeout } from "@/lib/ask-dev/deadline";
import {
    prepareInvestigation,
    streamRequest,
    type PreparedInvestigation,
} from "@/lib/ask-dev/investigation.server";
import { InvestigationEventGate } from "@/lib/ask-dev/investigation-events";
import {
    KEEPALIVE_FRAME,
    KEEPALIVE_INTERVAL_MS,
    MAX_EVENT_BYTES,
    MAX_STREAM_BYTES,
    errorFrame,
} from "@/lib/ask-dev/sse-frames";
import { SseEventTooLargeError, SseParser, type SseEvent } from "@/lib/ask-dev/sse-parser";

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

async function readBoundedErrorBody(response: Response, abort: AbortSignal): Promise<unknown> {
    try {
        const reader = response.body?.getReader();
        if (reader === undefined) return undefined;
        // A read ends when web aborts upstream, whether or not the transport errors the body.
        const aborted = new Promise<never>((_, reject) => {
            const onAbort = (): void =>
                reject(new DOMException("The upstream read was aborted.", "AbortError"));
            if (abort.aborted) onAbort();
            else abort.addEventListener("abort", onAbort, { once: true });
        });
        aborted.catch(() => undefined);
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
            const next = await Promise.race([reader.read(), aborted]);
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
 * answers, and a keepalive follows every 10 s until the terminal, so no hop sees a silent
 * connection. ACR's stream is parsed incrementally; each event is validated and written again
 * whole (`InvestigationEventGate`), never as raw bytes, so a keepalive never lands inside an
 * event. A failure after this point is a terminal `error` frame, because the status line has
 * already been sent; the browser gets exactly one terminal. Browser abort aborts ACR.
 */
function relay(
    prepared: PreparedInvestigation,
    requestId: string,
    browser: AbortSignal,
    deadline: RunDeadline,
): Response {
    const upstreamAbort = new AbortController();
    const abort = (): void => upstreamAbort.abort();
    // A browser that left while the request was being prepared never gets an abort event.
    if (browser.aborted) upstreamAbort.abort();
    else browser.addEventListener("abort", abort, { once: true });
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    // Why web itself stopped the upstream call. A timer that wins is logged, never silent.
    let cause: "deadline" | "stalled" | undefined;
    let headersReceived = false;
    // Set when the browser has its terminal, ACR's or web's: nothing is written after it.
    let terminalWritten = false;
    const gate = new InvestigationEventGate();

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
            const fail = (
                error: AcrRuntimeError,
                code: string = error.code,
                phase?: "admission" | "streaming",
            ): void => {
                logger.warn(
                    {
                        request_id: requestId,
                        code,
                        phase,
                        status: error.status,
                        reserved_result_id: gate.reservedResultId,
                        last_seq: gate.lastSeq,
                        after_terminal: terminalWritten,
                        elapsed_ms: deadline.elapsedMs(),
                        remaining_ms: deadline.remainingMs(),
                        run_timeout_ms: deadline.runTimeoutMs,
                    },
                    terminalWritten
                        ? "ask-dev upstream failed after the terminal event; nothing more is written"
                        : "ask-dev investigation failed after the stream opened",
                );
                if (terminalWritten) return;
                terminalWritten = true;
                clearInterval(keepalive);
                write(
                    errorFrame({
                        code,
                        message: safeAcrRuntimeMessage(error.code),
                        requestId,
                        retryable: error.retryable,
                        retryAfterSeconds: error.retryAfterSeconds,
                        phase,
                    }),
                );
            };
            // Abort at D: the run ends here even if ACR is still going.
            deadlineTimer = setTimeout(() => {
                cause = "deadline";
                logger.warn(
                    {
                        request_id: requestId,
                        branch: "deadline",
                        phase: headersReceived ? "streaming" : "admission",
                        elapsed_ms: deadline.elapsedMs(),
                        run_timeout_ms: deadline.runTimeoutMs,
                    },
                    "ask-dev run deadline reached; aborting upstream",
                );
                upstreamAbort.abort();
            }, deadline.remainingMs());
            // Stall: no upstream byte for STALL_MS once the stream is open (`accepted` is written
            // with the headers, so the window opens there and every byte, heartbeat included,
            // restarts it).
            const armStall = (): void => {
                clearTimeout(stallTimer);
                stallTimer = setTimeout(() => {
                    cause = "stalled";
                    logger.warn(
                        {
                            request_id: requestId,
                            branch: "stalled",
                            phase: "streaming",
                            stall_ms: STALL_MS,
                            elapsed_ms: deadline.elapsedMs(),
                            remaining_ms: deadline.remainingMs(),
                        },
                        "ask-dev upstream stalled; aborting upstream",
                    );
                    upstreamAbort.abort();
                }, STALL_MS);
            };
            try {
                if (upstreamAbort.signal.aborted) return;
                const response = await prepared.client.openInvestigationStream(
                    streamRequest(prepared, { requestId, signal: upstreamAbort.signal, deadline }),
                );
                headersReceived = true;
                if (!response.ok) {
                    const upstream = wireError(
                        await readBoundedErrorBody(response, upstreamAbort.signal),
                    );
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
                        // 406 is the stream-off answer (plan 2.7.1): the status decides, whatever
                        // the wire code.
                        response.status === 406 ? "stream_unavailable" : undefined,
                    );
                    return;
                }
                // The media type is the part before any parameter, compared without case.
                const mediaType = (response.headers.get("content-type") ?? "")
                    .split(";")[0]!
                    .trim()
                    .toLowerCase();
                if (mediaType !== "text/event-stream" || response.body === null) {
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
                // A read must end when web aborts upstream (stall, deadline, browser), whether or
                // not the transport turns the abort into a body error.
                const aborted = new Promise<never>((_, reject) => {
                    const onAbort = (): void =>
                        reject(new DOMException("The upstream read was aborted.", "AbortError"));
                    if (upstreamAbort.signal.aborted) onAbort();
                    else upstreamAbort.signal.addEventListener("abort", onAbort, { once: true });
                });
                aborted.catch(() => undefined);
                const parser = new SseParser(MAX_EVENT_BYTES);
                // An upstream that breaks the contract: logged by reason, never by content, then
                // one `invalid_upstream` terminal, and ACR is aborted.
                const invalidUpstream = (
                    reason: string,
                    detail: { seq?: number; errors?: readonly string[] } = {},
                    code: "malformed_response" | "response_too_large" = "malformed_response",
                ): void => {
                    logger.warn(
                        {
                            request_id: requestId,
                            branch: "invalid_upstream",
                            reason,
                            seq: detail.seq,
                            schema_errors: detail.errors,
                            reserved_result_id: gate.reservedResultId,
                            last_seq: gate.lastSeq,
                            events: gate.written,
                        },
                        "ask-dev upstream event stream broke the contract; aborting upstream",
                    );
                    upstreamAbort.abort();
                    fail(
                        new AcrRuntimeError(
                            code,
                            code === "response_too_large"
                                ? "Agent Context Runtime returned an oversized response."
                                : "Agent Context Runtime returned an invalid response.",
                        ),
                        "invalid_upstream",
                        "streaming",
                    );
                };
                // Writes each validated event; reports false when the stream must stop.
                const relayEvents = (events: readonly SseEvent[]): boolean => {
                    for (const event of events) {
                        const verdict = gate.accept(event);
                        if (verdict.kind === "invalid") {
                            invalidUpstream(verdict.reason, verdict);
                            return false;
                        }
                        if (verdict.kind === "after_terminal") {
                            logger.warn(
                                {
                                    request_id: requestId,
                                    branch: verdict.duplicateTerminal
                                        ? "duplicate_terminal"
                                        : "event_after_terminal",
                                    event_type: verdict.eventType,
                                    terminal: gate.terminal,
                                    reserved_result_id: gate.reservedResultId,
                                    last_seq: gate.lastSeq,
                                },
                                verdict.duplicateTerminal
                                    ? "ask-dev dropped a second terminal event from upstream"
                                    : "ask-dev dropped an upstream event that followed the terminal event",
                            );
                            continue;
                        }
                        if (verdict.seqGap > 0) {
                            logger.warn(
                                {
                                    request_id: requestId,
                                    branch: "seq_gap",
                                    seq: verdict.event.seq,
                                    seq_gap: verdict.seqGap,
                                    reserved_result_id: gate.reservedResultId,
                                },
                                "ask-dev upstream skipped event numbers; an event was lost on the way",
                            );
                        }
                        write(verdict.frame);
                        if (verdict.terminal) {
                            // ACR's terminal is the browser's terminal; read on only to log
                            // what follows, until ACR closes.
                            terminalWritten = true;
                            clearInterval(keepalive);
                        }
                    }
                    return true;
                };
                let received = 0;
                armStall();
                for (;;) {
                    const next = await Promise.race([reader.read(), aborted]);
                    if (next.done) break;
                    armStall();
                    received += next.value.byteLength;
                    if (received > MAX_STREAM_BYTES) {
                        invalidUpstream("stream_too_large", {}, "response_too_large");
                        return;
                    }
                    let events: SseEvent[];
                    try {
                        events = parser.push(next.value);
                    } catch (error) {
                        if (error instanceof SseEventTooLargeError) {
                            invalidUpstream("event_too_large", {}, "response_too_large");
                        } else {
                            invalidUpstream("malformed_frame");
                        }
                        return;
                    }
                    if (!relayEvents(events)) return;
                }
                const { discardedPartialEvent } = parser.end();
                if (gate.terminal === undefined) {
                    // ACR closed the stream with no terminal: neither an answer nor a failure.
                    logger.warn(
                        {
                            request_id: requestId,
                            branch: "interrupted",
                            reason: "eof_without_terminal",
                            discarded_partial_event: discardedPartialEvent,
                            reserved_result_id: gate.reservedResultId,
                            last_seq: gate.lastSeq,
                            events: gate.written,
                            elapsed_ms: deadline.elapsedMs(),
                        },
                        "ask-dev upstream ended without a terminal event",
                    );
                    fail(
                        new AcrRuntimeError(
                            acrRuntimeErrorCodes.interrupted,
                            "The run ended before it finished.",
                            { retryable: true },
                        ),
                        undefined,
                        "streaming",
                    );
                } else if (discardedPartialEvent) {
                    logger.warn(
                        {
                            request_id: requestId,
                            branch: "event_after_terminal",
                            discarded_partial_event: true,
                            reserved_result_id: gate.reservedResultId,
                            last_seq: gate.lastSeq,
                        },
                        "ask-dev dropped an incomplete upstream frame that followed the terminal event",
                    );
                }
            } catch (error) {
                if (browser.aborted) return;
                if (cause === "stalled") {
                    fail(
                        new AcrRuntimeError(
                            acrRuntimeErrorCodes.stalled,
                            "Agent Context Runtime stopped sending data.",
                            { cause: error, retryable: true },
                        ),
                        undefined,
                        "streaming",
                    );
                } else if (cause === "deadline" && !headersReceived) {
                    // D and the header wait ended together: ACR never answered, so this is the
                    // same admission failure as a header wait that runs out.
                    fail(
                        new AcrRuntimeError(
                            acrRuntimeErrorCodes.timeout,
                            "Agent Context Runtime did not respond in time.",
                            { cause: error, retryable: true, status: 504 },
                        ),
                        undefined,
                        "admission",
                    );
                } else if (cause === "deadline") {
                    fail(
                        new AcrRuntimeError(
                            acrRuntimeErrorCodes.interrupted,
                            "The run reached its deadline.",
                            { cause: error, retryable: true },
                        ),
                        undefined,
                        "streaming",
                    );
                } else {
                    const runtimeError = toRuntimeError(error);
                    // `timeout` before headers is the header wait running out: admission.
                    fail(
                        runtimeError,
                        undefined,
                        !headersReceived && runtimeError.code === acrRuntimeErrorCodes.timeout
                            ? "admission"
                            : undefined,
                    );
                }
            } finally {
                clearInterval(keepalive);
                clearTimeout(deadlineTimer);
                clearTimeout(stallTimer);
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
            clearTimeout(deadlineTimer);
            clearTimeout(stallTimer);
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

async function readThenPrepare(
    request: Request,
    deadline: RunDeadline,
    setupSignal: AbortSignal,
): Promise<PreparedInvestigation> {
    return prepareInvestigation({
        body: await readRequestJson(request, MAX_REQUEST_BYTES),
        signal: AbortSignal.any([request.signal, setupSignal]),
        submissionId: request.headers.get("x-acr-submission-id"),
        threadId: request.headers.get("x-acr-thread-id"),
        deadline,
    });
}

/**
 * The per-call auth chain (`prepareInvestigation`), held to the run deadline: D covers setup too,
 * so a body read or a session read that never returns ends in a 504 at D, and the setup reads see
 * the same abort.
 */
async function prepareWithinDeadline(
    request: Request,
    requestId: string,
    deadline: RunDeadline,
): Promise<PreparedInvestigation> {
    const setupAbort = new AbortController();
    let setupTimer: ReturnType<typeof setTimeout> | undefined;
    const setupDeadline = new Promise<never>((_, reject) => {
        setupTimer = setTimeout(() => {
            logger.warn(
                {
                    request_id: requestId,
                    branch: "setup_deadline",
                    phase: "setup",
                    elapsed_ms: deadline.elapsedMs(),
                    run_timeout_ms: deadline.runTimeoutMs,
                },
                "ask-dev run deadline reached during setup",
            );
            setupAbort.abort();
            reject(
                new AcrRuntimeError(
                    acrRuntimeErrorCodes.timeout,
                    "Agent Context Runtime did not respond in time.",
                    { retryable: true, status: 504 },
                ),
            );
        }, deadline.remainingMs());
    });
    setupDeadline.catch(() => undefined);
    try {
        // Promise.race handles both sides, so the loser's later failure is never unhandled. The
        // call stays directly under `await`: the auth-profile gate's call walk follows it there.
        return await Promise.race([
            readThenPrepare(request, deadline, setupAbort.signal),
            setupDeadline,
        ]);
    } finally {
        clearTimeout(setupTimer);
    }
}

export async function POST(request: Request): Promise<Response> {
    const requestId = randomUUID();
    // t0 is the first line of the handler: the run deadline D = t0 + W covers setup too.
    const runTimeout = resolveRunTimeout(process.env.ASK_DEV_RUN_TIMEOUT_MS);
    if (runTimeout.source === "invalid" || runTimeout.source === "clamped") {
        logger.warn(
            { request_id: requestId, run_timeout_ms: runTimeout.ms, source: runTimeout.source },
            "ASK_DEV_RUN_TIMEOUT_MS is not usable as set; using the bounded value",
        );
    }
    const deadline = new RunDeadline(runTimeout.ms);
    try {
        // First of all: no session read, no ops call and no body read for a cross-site POST.
        if (!isSameOriginRequest(request)) {
            throw new AcrRuntimeError(acrRuntimeErrorCodes.originRefused, "Request rejected.", {
                status: 403,
            });
        }
        const prepared = await prepareWithinDeadline(request, requestId, deadline);
        return relay(prepared, requestId, request.signal, deadline);
    } catch (error) {
        const runtimeError = toRuntimeError(error);
        logger.warn(
            { request_id: requestId, code: runtimeError.code, status: runtimeError.status },
            "ask-dev investigation denied before the stream opened",
        );
        return failureBody(runtimeError, requestId);
    }
}
