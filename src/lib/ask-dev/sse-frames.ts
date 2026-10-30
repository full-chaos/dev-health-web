/** SSE framing helpers for the Ask Dev route. Pure: no secrets, safe to unit test. */

export const KEEPALIVE_FRAME = ": keepalive\n\n";
/** Shorter than the 60 s ingress idle limit (plan INV-3, §2.7.6). */
export const KEEPALIVE_INTERVAL_MS = 10_000;

/** Largest upstream stream web relays before it stops the run (plan §2.7.7). */
export const MAX_STREAM_BYTES = 8 * 1_024 * 1_024;

/**
 * ACR's largest answer: the `max_serialized_bytes` maximum of the pinned `InvestigationOptions`
 * (`context_fabric_common.v1`). A test holds it to the pin.
 */
export const ACR_MAX_SERIALIZED_BYTES = 1_048_576;

/** Largest single upstream event web parses: ACR's largest answer plus 64 KiB (plan §2.7.7). */
export const MAX_EVENT_BYTES = ACR_MAX_SERIALIZED_BYTES + 64 * 1_024;

export type WebErrorFrame = {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number | undefined;
    /** Where the run was when it failed (`admission` before ACR answered, else `streaming`). */
    readonly phase?: "admission" | "streaming" | undefined;
};

/**
 * The terminal frame web writes when the run cannot continue: a web-origin event (`source: "web"`,
 * no `id`). ACR's own events, its `error` included, are validated and written again by web
 * (`investigation-events.ts`). After the stream opens, the web-only codes are `interrupted` (ACR
 * ended the stream with no terminal, or the run reached its deadline), `stalled`,
 * `invalid_upstream`, `stream_unavailable` and `budget_exhausted`; ACR refusals that arrive
 * before `accepted` keep their mapped codes.
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
        ...(error.phase === undefined ? {} : { phase: error.phase }),
        source: "web",
    };
    return `event: error\ndata: ${JSON.stringify(data)}\n\n`;
}
