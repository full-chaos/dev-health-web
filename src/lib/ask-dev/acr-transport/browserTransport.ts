import type { ACRErrorV1, ContextFabricSubmissionStatusV1 } from "@/lib/acr/generated";
import { type AcrAccessToken } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import {
    ACR_MIN_WAIT_BUDGET_SECONDS,
    HEADER_WAIT_MAX_MS,
    STALL_MS,
    WAIT_BUDGET_HEADROOM_MS,
} from "@/lib/ask-dev/deadline";
import { logger } from "@/lib/logger";
import { asTranscriptResult } from "@/components/ask-dev/answer/testModeAnswer";
import type { TranscriptResult } from "@/components/ask-dev/answer/AskDevTurn";
import {
    TransportFailure,
    TransportRefusal,
    type AskDevTransport,
    type InvestigateCall,
    type InvestigationEvent,
} from "@/components/ask-dev/conversation/transport";

import { InvestigationEventGate } from "./eventGate";
import { ACR_CLIENT_VERSION, MAX_BODY_BYTES, MAX_EVENT_BYTES, MAX_STREAM_BYTES } from "./limits";
import { SseEventTooLargeError, SseMalformedError, SseParser } from "./sseParser";

/**
 * The browser's ACR transport (CHAOS-12104, T14a; design amendment §2.2, §4, §6, §8; plan §2.7.5 to
 * §2.7.7). The browser calls acr-api directly; there is no web route.
 *
 * - **Calls:** `investigate` (the event stream), `submissionStatus` and `readResult` (the replay).
 *   Every call is a `fetch` with `credentials: "omit"` and `redirect: "error"`. Its headers are
 *   `Authorization: Bearer` with the in-memory access token, `X-ACR-Resource` (ACR's issuer, the
 *   only resource the browser class binds) and `X-ACR-Client-Version`. No token ever goes in a
 *   URL. The threads, attach, cancel and feedback calls are T14b (CHAOS-12336). Until then they
 *   refuse locally and send nothing.
 * - **Token:** read right before each call, from the token store's memory only
 *   (`getAcrAccessToken`). The `sessionStorage` family is never read here. No token is
 *   `TransportFailure("authorization_required")`: the panel's "Connect Ask Dev" state.
 * - **401 (CHAOS-12305):** ACR refused the token. The transport tells the store
 *   (`reportAcrTokenRejected`), which drops it if it is still held, and reads the token once
 *   more; the store then refreshes. A different token sends the call once more (the same
 *   `X-ACR-Submission-ID`, so a retried `investigate` is idempotent). The same token, no token, or
 *   a second 401 is "authorization required". There is no loop: at most 2 requests per call.
 * - **Deadline:** the store's absolute deadline D. The budget header is floor(D − now − 5 s) when
 *   the call is sent; below ACR's minimum the call is not sent (`budget_exhausted`). The response
 *   headers have min(15 s, D − now) (`admission_timeout`). Once they arrive, 30 s with no byte is
 *   `stalled`. The store aborts at D through the signal.
 * - **Stream:** the SSE parser (ported from #1608), at most `MAX_EVENT_BYTES` per event and
 *   `MAX_STREAM_BYTES` in all, then the event gate (`eventGate.ts`). Any break before a valid
 *   terminal is `invalid_upstream`. A later event in the same read is dropped and logged, and the
 *   stream closes. The end of the stream with no terminal returns: the store recovers the run
 *   through the submission status.
 * - **Validators** (generated standalone code; the lead's option (c)): every event is checked at
 *   once against the event envelope (`streamEnvelopeValidators.js`, small, loaded with the
 *   transport). The full schemas (`streamValidators.js`, ~205 KB gzip: the event with its whole
 *   result, and result v1/v2) start loading at the submit or the replay, in parallel with the call.
 *   Only the `result` terminal and the replay wait for them. Nothing is loaded on panel open.
 * - **Logs:** content-free (submission id, status, closed reason codes, counts). Never a token, a
 *   question, an answer or a URL.
 */

/** The small generated checks, loaded with the transport (`@/lib/acr/streamEnvelopeValidators`). */
export type StreamEnvelopeValidators = {
    readonly validateInvestigationEventEnvelope: (value: unknown) => boolean;
    readonly validateSubmissionStatus: (value: unknown) => boolean;
    readonly validateErrorEnvelope: (value: unknown) => boolean;
};

/** The full generated checks, loaded from the first call on (`@/lib/acr/streamValidators`). */
export type StreamValidators = {
    readonly validateInvestigationEvent: (value: unknown) => boolean;
    readonly validateInvestigationResultV1: (value: unknown) => boolean;
    readonly validateInvestigationResultV2: (value: unknown) => boolean;
};

export type BrowserTransportDependencies = {
    readonly fetch: typeof fetch;
    readonly now: () => number;
    /** The token store's access token, read right before each call (`getAcrAccessToken`). */
    readonly token: () => AcrAccessToken | Promise<AcrAccessToken>;
    /** ACR answered 401 for `token`: the store drops it if it is still held (CHAOS-12305). */
    readonly rejected: (token: string) => void;
    readonly envelope: StreamEnvelopeValidators;
    /** Starts (or joins) the load of the full checks. */
    readonly validators: () => Promise<StreamValidators>;
};

const API = "/api/v1/context-fabric";

/** A member T14b (CHAOS-12336) serves: refused locally, with no request. */
function notServedYet(member: string): never {
    throw new Error(`ask-dev browser transport: ${member} is served by CHAOS-12336 (T14b)`);
}

/** ACR's `Retry-After` in whole seconds, when it is one. */
function retryAfterOf(response: Response): number | undefined {
    const raw = response.headers.get("Retry-After");
    if (raw === null || !/^\d{1,6}$/u.test(raw.trim())) return undefined;
    return Number(raw.trim());
}

/**
 * Reads a JSON body of at most `MAX_BODY_BYTES`; `undefined` when it is larger or not JSON. An end
 * of `signal` cancels the read and throws the signal's reason: a body that stalls never outlives
 * its call (codex r3).
 */
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw signal.reason;
    const body = response.body;
    if (body === null) return undefined;
    const reader = body.getReader();
    const stop = () => void reader.cancel(signal.reason).catch(() => undefined);
    signal.addEventListener("abort", stop, { once: true });
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            // A canceled read reads as done: the abort decides what that means.
            if (signal.aborted) throw signal.reason;
            if (done) break;
            size += value.length;
            if (size > MAX_BODY_BYTES) {
                await reader.cancel().catch(() => undefined);
                return undefined;
            }
            parts.push(value);
        }
    } catch {
        // A body fetch errors on abort reads as the abort, not as a broken body.
        if (signal.aborted) throw signal.reason;
        return undefined;
    } finally {
        signal.removeEventListener("abort", stop);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        joined.set(part, offset);
        offset += part.length;
    }
    try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown;
    } catch {
        return undefined;
    }
}

/** An `error.v1` envelope for a status with no valid body (a 404 replay, for example). */
function syntheticError(status: number, code: string): ACRErrorV1 {
    return {
        schema_version: "error.v1",
        request_id: "browser_transport",
        error: {
            code,
            message: "ACR answered with no error body.",
            http_status: status,
            retryable: false,
        },
    } as ACRErrorV1;
}

export function createAcrBrowserTransport(
    config: AcrBrowserClientConfig,
    dependencies: BrowserTransportDependencies,
): AskDevTransport {
    const base = `${config.issuer}${API}`;

    /**
     * Starts (or joins) the load of the full checks. Its failure is seen where it is awaited; it is
     * never an unhandled rejection, since a run may end before it needs the checks.
     */
    function startFullChecks(): Promise<StreamValidators> {
        const loading = dependencies.validators();
        loading.catch(() => undefined);
        return loading;
    }

    /** The in-memory token, read right before a call; none is "authorization required". */
    async function bearer(): Promise<string> {
        const held = await dependencies.token();
        if (held.kind !== "token") throw new TransportFailure("authorization_required");
        return held.token;
    }

    /**
     * ACR answered 401 for `token` (CHAOS-12305). Tells the store, then reads the token once more:
     * a different token is the one retry; anything else is null ("authorization required").
     */
    async function another(token: string): Promise<string | null> {
        dependencies.rejected(token);
        const next = await dependencies.token();
        return next.kind === "token" && next.token !== token ? next.token : null;
    }

    const headers = (token: string, extra: Record<string, string>): Record<string, string> => ({
        Authorization: `Bearer ${token}`,
        "X-ACR-Resource": config.issuer,
        "X-ACR-Client-Version": ACR_CLIENT_VERSION,
        ...extra,
    });

    /**
     * Throws what a non-2xx answer means: 401 is "authorization required"; an `error.v1` body is
     * a `TransportRefusal`; anything else is a dropped call (the store recovers it).
     */
    async function refuse(
        response: Response,
        operation: string,
        signal: AbortSignal,
    ): Promise<never> {
        logger.info({ operation, status: response.status }, "ask-dev acr call refused");
        if (response.status === 401) throw new TransportFailure("authorization_required");
        const body = await boundedJson(response, signal);
        if (body !== undefined && dependencies.envelope.validateErrorEnvelope(body)) {
            throw new TransportRefusal(response.status, body as ACRErrorV1, retryAfterOf(response));
        }
        if (response.status === 404) {
            throw new TransportRefusal(404, syntheticError(404, "not_found"));
        }
        throw new Error(`ask-dev acr ${operation}: ${String(response.status)} with no error body`);
    }

    /**
     * One JSON GET with the 15 s header bound. A 401 is retried once with a different token
     * (CHAOS-12305).
     */
    async function getJson(
        path: string,
        operation: string,
        signal: AbortSignal,
    ): Promise<{ readonly response: Response; readonly body: unknown }> {
        if (signal.aborted) throw signal.reason;
        const token = await bearer();
        let response = await get(path, operation, signal, token);
        if (response.status === 401) {
            void response.body?.cancel().catch(() => undefined);
            const next = await another(token);
            if (next !== null) {
                response = await get(path, operation, signal, next);
                if (response.status === 401) dependencies.rejected(next);
            }
        }
        if (response.status === 404 || !response.ok) return { response, body: undefined };
        return { response, body: await boundedJson(response, signal) };
    }

    /** One GET, to its response headers, with the 15 s bound. */
    async function get(
        path: string,
        operation: string,
        signal: AbortSignal,
        token: string,
    ): Promise<Response> {
        // The signal may end while the token store answers: then nothing is sent.
        if (signal.aborted) throw signal.reason;
        const controller = new AbortController();
        const stop = () => controller.abort(signal.reason);
        signal.addEventListener("abort", stop, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, HEADER_WAIT_MAX_MS);
        try {
            const response = await dependencies.fetch(`${base}${path}`, {
                method: "GET",
                headers: headers(token, { Accept: "application/json" }),
                credentials: "omit",
                redirect: "error",
                cache: "no-store",
                signal: controller.signal,
            });
            clearTimeout(timer);
            return response;
        } catch (error) {
            if (timedOut) throw new Error(`ask-dev acr ${operation}: no answer in time`);
            throw error;
        } finally {
            clearTimeout(timer);
            signal.removeEventListener("abort", stop);
        }
    }

    async function* investigate(call: InvestigateCall): AsyncGenerator<InvestigationEvent> {
        const budgetNow = () =>
            Math.floor((call.deadline - dependencies.now() - WAIT_BUDGET_HEADROOM_MS) / 1_000);
        if (budgetNow() < ACR_MIN_WAIT_BUDGET_SECONDS) {
            throw new TransportFailure("budget_exhausted");
        }
        let token = await bearer();
        // Option (c): the full checks start loading now, in parallel with the call; only the
        // `result` terminal waits for them.
        const full = startFullChecks();
        // The header is computed when the call is sent, from what is left of D (plan §2.7.6).
        let budget = budgetNow();
        if (budget < ACR_MIN_WAIT_BUDGET_SECONDS) throw new TransportFailure("budget_exhausted");

        const controller = new AbortController();
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        // Ending a call cancels its body reader too: a pending read never waits on the fetch's own
        // abort to give up.
        const halt = (reason?: unknown) => {
            controller.abort(reason);
            void reader?.cancel().catch(() => undefined);
        };
        const stop = () => halt(call.signal.reason);
        if (call.signal.aborted) throw call.signal.reason;
        call.signal.addEventListener("abort", stop, { once: true });
        let ended: "admission_timeout" | "stalled" | undefined;
        const end = (reason: "admission_timeout" | "stalled") => {
            ended = reason;
            halt();
        };
        /** What a read that ended (or failed) after a halt means. */
        const halted = (): unknown =>
            ended !== undefined
                ? new TransportFailure(ended)
                : call.signal.aborted
                  ? call.signal.reason
                  : undefined;
        // The header wait is min(15 s, D − now) (plan §2.7.6). A call is sent only with D − now − 5 s at
        // least ACR's 10 s minimum, so D − now is at least 15 s here, and the wait is 15 s.
        let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
            () => end("admission_timeout"),
            HEADER_WAIT_MAX_MS,
        );
        try {
            const send = async (): Promise<Response> => {
                try {
                    return await dependencies.fetch(`${base}/investigations`, {
                        method: "POST",
                        headers: headers(token, {
                            Accept: "text/event-stream",
                            "Content-Type": "application/json",
                            "X-ACR-Submission-ID": call.submissionId,
                            "X-ACR-Thread-ID": call.threadId,
                            "X-ACR-Wait-Budget-Seconds": String(budget),
                        }),
                        body: JSON.stringify(call.request),
                        credentials: "omit",
                        redirect: "error",
                        cache: "no-store",
                        signal: controller.signal,
                    });
                } catch (error) {
                    throw halted() ?? error;
                }
            };
            let response = await send();
            clearTimeout(timer);
            if (response.status === 401) {
                // CHAOS-12305: one retry with a different token, the same submission id (idempotent);
                // its budget and header wait are computed again at the resend.
                void response.body?.cancel().catch(() => undefined);
                const next = await another(token);
                if (next !== null) {
                    if (call.signal.aborted) throw call.signal.reason;
                    budget = budgetNow();
                    if (budget < ACR_MIN_WAIT_BUDGET_SECONDS) {
                        throw new TransportFailure("budget_exhausted");
                    }
                    token = next;
                    timer = setTimeout(() => end("admission_timeout"), HEADER_WAIT_MAX_MS);
                    response = await send();
                    clearTimeout(timer);
                    if (response.status === 401) dependencies.rejected(token);
                }
            }
            if (!response.ok) await refuse(response, "investigate", call.signal);
            const type = response.headers.get("Content-Type") ?? "";
            if (!/^text\/event-stream\b/iu.test(type) || response.body === null) {
                logger.warn(
                    { submission_id: call.submissionId },
                    "ask-dev acr stream answered with no event stream",
                );
                throw new TransportFailure("invalid_upstream");
            }
            reader = response.body.getReader();
            const parser = new SseParser(MAX_EVENT_BYTES);
            const gate = new InvestigationEventGate(
                dependencies.envelope.validateInvestigationEventEnvelope,
                call,
            );
            let total = 0;
            const arm = () => {
                clearTimeout(timer);
                timer = setTimeout(() => end("stalled"), STALL_MS);
            };
            arm();
            for (;;) {
                let chunk: ReadableStreamReadResult<Uint8Array>;
                try {
                    chunk = await reader.read();
                } catch (error) {
                    throw halted() ?? error;
                }
                // A canceled reader reads as done: the halt decides what that means.
                const why = halted();
                if (why !== undefined) throw why;
                if (chunk.done) {
                    const { discardedPartialEvent } = parser.end();
                    logger.warn(
                        {
                            submission_id: call.submissionId,
                            last_seq: gate.lastSeq,
                            partial_event: discardedPartialEvent,
                        },
                        "ask-dev acr stream ended without a terminal",
                    );
                    return;
                }
                arm();
                total += chunk.value.length;
                if (total > MAX_STREAM_BYTES) {
                    logger.warn(
                        { submission_id: call.submissionId, cap: "stream" },
                        "ask-dev acr stream over its cap",
                    );
                    throw new TransportFailure("invalid_upstream");
                }
                let frames;
                try {
                    frames = parser.push(chunk.value);
                } catch (error) {
                    const cap = error instanceof SseEventTooLargeError ? "event" : "framing";
                    if (!(
                        error instanceof SseEventTooLargeError || error instanceof SseMalformedError
                    )) {
                        throw error;
                    }
                    logger.warn(
                        { submission_id: call.submissionId, cap },
                        "ask-dev acr stream broke its framing",
                    );
                    throw new TransportFailure("invalid_upstream");
                }
                for (const frame of frames) {
                    const verdict = gate.accept(frame);
                    if (verdict.kind === "invalid") {
                        logger.warn(
                            {
                                submission_id: call.submissionId,
                                reason: verdict.reason,
                                seq: verdict.seq,
                            },
                            "ask-dev acr stream broke its grammar",
                        );
                        throw new TransportFailure("invalid_upstream");
                    }
                    if (verdict.kind === "after_terminal") {
                        logger.warn(
                            { submission_id: call.submissionId, event_type: verdict.eventType },
                            "ask-dev acr event after the terminal dropped",
                        );
                        continue;
                    }
                    if (verdict.event.type === "result") {
                        const checks = await full;
                        if (!checks.validateInvestigationEvent(verdict.event)) {
                            logger.warn(
                                {
                                    submission_id: call.submissionId,
                                    reason: "schema",
                                    seq: verdict.event.seq,
                                },
                                "ask-dev acr stream broke its grammar",
                            );
                            throw new TransportFailure("invalid_upstream");
                        }
                    }
                    yield verdict.event;
                }
                // The terminal was passed on: the stream closes.
                if (gate.ended) return;
            }
        } finally {
            clearTimeout(timer);
            call.signal.removeEventListener("abort", stop);
            controller.abort();
            await reader?.cancel().catch(() => undefined);
        }
    }

    return {
        investigate,
        async submissionStatus(submissionId, signal) {
            const path = `/investigations/submissions/${encodeURIComponent(submissionId)}`;
            const { response, body } = await getJson(path, "status", signal);
            if (response.status === 404) return null;
            if (!response.ok) return refuse(response, "status", signal);
            if (body === undefined || !dependencies.envelope.validateSubmissionStatus(body)) {
                throw new TransportFailure("invalid_upstream");
            }
            return body as ContextFabricSubmissionStatusV1;
        },
        async readResult(resultId, signal) {
            const path = `/investigations/${encodeURIComponent(resultId)}`;
            // The full checks load in parallel with the replay.
            const full = startFullChecks();
            const { response, body } = await getJson(path, "replay", signal);
            if (!response.ok) return refuse(response, "replay", signal);
            const validators = await full;
            const valid =
                body !== undefined &&
                (validators.validateInvestigationResultV1(body) ||
                    validators.validateInvestigationResultV2(body));
            const result = valid ? asTranscriptResult(body) : null;
            if (result === null) throw new TransportFailure("invalid_upstream");
            return result as TranscriptResult;
        },
        listThreads: () => notServedYet("listThreads"),
        readThread: () => notServedYet("readThread"),
        deleteThread: () => notServedYet("deleteThread"),
        attach: () => notServedYet("attach"),
        cancel: () => notServedYet("cancel"),
        readFeedback: () => notServedYet("readFeedback"),
        setFeedback: () => notServedYet("setFeedback"),
    };
}
