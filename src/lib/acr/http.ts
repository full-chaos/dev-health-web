import "server-only";

import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

type BoundedJsonRequest = {
    readonly body?: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly method: "GET" | "POST";
    readonly signal?: AbortSignal;
    readonly timeoutMs: number;
    readonly url: URL;
    /** Judges the status before the body is read: an error returned here is thrown as it is. */
    readonly classifyStatus?: (status: number) => AcrRuntimeError | null;
    /** The error for a body that is not JSON; `malformed_response` when absent. */
    readonly unreadableBody?: (cause?: unknown) => AcrRuntimeError;
};

export type JsonHttpResponse = {
    readonly status: number;
    readonly value: unknown;
    /** Parsed `Retry-After` (seconds form only), when the upstream sent one. */
    readonly retryAfterSeconds?: number;
};

export function retryAfterSeconds(response: Response): number | undefined {
    const value = response.headers.get("retry-after");
    if (value === null) return undefined;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function readBoundedBytes(
    stream: ReadableStream<Uint8Array> | null,
    maximumBytes: number,
): Promise<Uint8Array> {
    if (stream === null) return new Uint8Array(0);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            received += next.value.byteLength;
            if (received > maximumBytes) {
                // Not awaited: a cancel can wait on a body the peer never ends.
                void reader.cancel().catch(() => undefined);
                throw new AcrRuntimeError(
                    acrRuntimeErrorCodes.responseTooLarge,
                    "Agent Context Runtime returned an oversized response.",
                    { retryable: false },
                );
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

/** A body that is not UTF-8 is a `malformed_response`, as a body that is not JSON is. */
function decodeUtf8(body: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch (error) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.malformedResponse,
            "Agent Context Runtime returned an invalid response.",
            { cause: error },
        );
    }
}

function parseJson(body: string): unknown {
    try {
        return JSON.parse(body);
    } catch (error) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.malformedResponse,
            "Agent Context Runtime returned an invalid response.",
            { cause: error },
        );
    }
}

function responseSize(response: Response): number | undefined {
    const value = response.headers.get("content-length");
    if (value === null) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Not awaited: a cancel can wait on a body the peer never ends. */
function releaseBody(response: Response): void {
    void response.body?.cancel().catch(() => undefined);
}

export async function fetchBoundedJson(input: BoundedJsonRequest): Promise<JsonHttpResponse> {
    const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
        response = await fetch(input.url, {
            body: input.body,
            cache: "no-store",
            headers: { ...input.headers, "Cache-Control": "no-store" },
            method: input.method,
            redirect: "error",
            signal,
        });
    } catch (error) {
        if (timeoutSignal.aborted) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.timeout,
                "Agent Context Runtime did not respond in time.",
                { cause: error, retryable: true, status: 504 },
            );
        }
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { cause: error, retryable: true },
        );
    }
    const statusError = input.classifyStatus?.(response.status) ?? null;
    if (statusError !== null) {
        releaseBody(response);
        throw statusError;
    }
    const contentLength = responseSize(response);
    if (contentLength !== undefined && contentLength > 1_048_576) {
        releaseBody(response);
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.responseTooLarge,
            "Agent Context Runtime returned an oversized response.",
        );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        releaseBody(response);
        throw (
            input.unreadableBody?.() ??
            new AcrRuntimeError(
                acrRuntimeErrorCodes.malformedResponse,
                "Agent Context Runtime returned an invalid response.",
            )
        );
    }
    let body: Uint8Array;
    try {
        body = await readBoundedBytes(response.body, 1_048_576);
    } catch (error) {
        if (error instanceof AcrRuntimeError) throw error;
        if (timeoutSignal.aborted) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.timeout,
                "Agent Context Runtime did not respond in time.",
                { cause: error, retryable: true, status: 504 },
            );
        }
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.unavailable,
            "Agent Context Runtime is temporarily unavailable.",
            { cause: error, retryable: true },
        );
    }
    let value: unknown;
    try {
        value = parseJson(decodeUtf8(body));
    } catch (error) {
        throw input.unreadableBody?.(error) ?? error;
    }
    return { status: response.status, retryAfterSeconds: retryAfterSeconds(response), value };
}

export async function readRequestJson(request: Request, maximumBytes: number): Promise<unknown> {
    try {
        return parseJson(decodeUtf8(await readBoundedBytes(request.body, maximumBytes)));
    } catch (error) {
        if (
            error instanceof AcrRuntimeError &&
            (error.code === acrRuntimeErrorCodes.malformedResponse ||
                error.code === acrRuntimeErrorCodes.responseTooLarge)
        ) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.invalidRequest,
                "The context request is invalid.",
                {
                    cause: error,
                    status: error.code === acrRuntimeErrorCodes.responseTooLarge ? 413 : 400,
                },
            );
        }
        throw error;
    }
}
