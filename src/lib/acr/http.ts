import "server-only";

import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

type BoundedJsonRequest = {
    readonly body?: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly method: "GET" | "POST";
    readonly signal?: AbortSignal;
    readonly timeoutMs: number;
    readonly url: URL;
};

export type JsonHttpResponse = {
    readonly status: number;
    readonly value: unknown;
};

async function readBoundedText(
    stream: ReadableStream<Uint8Array> | null,
    maximumBytes: number,
): Promise<string> {
    if (stream === null) return "";
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            received += next.value.byteLength;
            if (received > maximumBytes) {
                await reader.cancel();
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
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
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
    const contentLength = responseSize(response);
    if (contentLength !== undefined && contentLength > 1_048_576) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.responseTooLarge,
            "Agent Context Runtime returned an oversized response.",
        );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.malformedResponse,
            "Agent Context Runtime returned an invalid response.",
        );
    }
    return {
        status: response.status,
        value: parseJson(await readBoundedText(response.body, 1_048_576)),
    };
}

export async function readRequestJson(request: Request, maximumBytes: number): Promise<unknown> {
    try {
        return parseJson(await readBoundedText(request.body, maximumBytes));
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
