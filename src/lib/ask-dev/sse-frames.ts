/** SSE framing helpers for the Ask Dev route. Pure: no secrets, safe to unit test. */

export const KEEPALIVE_FRAME = ": keepalive\n\n";
/** Shorter than the 60 s ingress idle limit (plan INV-3, §2.7.6). */
export const KEEPALIVE_INTERVAL_MS = 10_000;

/** Largest upstream stream web relays before it stops the run (plan §2.7.7). */
export const MAX_STREAM_BYTES = 8 * 1_024 * 1_024;

export type WebErrorFrame = {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number | undefined;
};

/**
 * The terminal frame web writes when the run cannot continue. It is a web-origin event
 * (`source: "web"`): ACR's own `error` event is relayed unchanged. I-S06 owns the closed set.
 */
export function errorFrame(error: WebErrorFrame): string {
    const data = {
        code: error.code,
        message: error.message,
        request_id: error.requestId,
        retryable: error.retryable,
        ...(error.retryAfterSeconds === undefined
            ? {}
            : { retry_after_seconds: error.retryAfterSeconds }),
        source: "web",
    };
    return `event: error\ndata: ${JSON.stringify(data)}\n\n`;
}
