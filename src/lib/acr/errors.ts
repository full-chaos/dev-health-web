import "server-only";

export const acrRuntimeErrorCodes = {
    configuration: "configuration",
    invalidRequest: "invalid_request",
    unauthenticated: "unauthenticated",
    notEntitled: "not_entitled",
    repositoryNotAvailable: "repository_not_available",
    incompatible: "incompatible",
    malformedResponse: "malformed_response",
    responseTooLarge: "response_too_large",
    upstream: "upstream",
    unavailable: "unavailable",
    timeout: "timeout",
    // OAuth consent (CHAOS-6226): distinct terminal states ACR reports for a
    // handle, kept separate from the generic `upstream` fallback so the
    // consent page can render the right copy instead of a blank retry.
    expired: "expired",
    alreadyCompleted: "already_completed",
    // Per-handle throttle on acr's POST /authorize/consent (ACR wire body
    // `{"error":"slow_down"}`, 20/min). Kept distinct from the generic
    // `upstream` 429 so the consent page can show a wait time and keep the
    // Approve/Deny buttons usable instead of a terminal error.
    rateLimited: "rate_limited",
    // CHAOS-3791 prep: error.v1 codes ACR will add once CHAOS-3784 merges (see
    // client.ts upstreamFailure). Web hardcodes retryable: true here per the
    // closed wire contract rather than trusting the upstream body's own
    // `retryable` field.
    interpretationRejected: "interpretation_rejected",
    synthesisRejected: "synthesis_rejected",
} as const;

export type AcrRuntimeErrorCode = (typeof acrRuntimeErrorCodes)[keyof typeof acrRuntimeErrorCodes];

type AcrRuntimeErrorOptions = {
    readonly cause?: unknown;
    readonly retryable?: boolean;
    readonly retryAfterSeconds?: number;
    readonly status?: number;
};

export class AcrRuntimeError extends Error {
    readonly name = "AcrRuntimeError";
    readonly status: number;
    readonly retryable: boolean;
    /** Present only when the upstream response carried a `Retry-After`. */
    readonly retryAfterSeconds: number | undefined;

    constructor(
        readonly code: AcrRuntimeErrorCode,
        message: string,
        options: AcrRuntimeErrorOptions = {},
    ) {
        super(message, { cause: options.cause });
        this.status = options.status ?? 503;
        this.retryable = options.retryable ?? false;
        this.retryAfterSeconds = options.retryAfterSeconds;
    }
}

export function isAcrRuntimeError(error: unknown): error is AcrRuntimeError {
    return error instanceof AcrRuntimeError;
}

export function safeAcrRuntimeMessage(code: AcrRuntimeErrorCode): string {
    switch (code) {
        case acrRuntimeErrorCodes.alreadyCompleted:
            return "This request was already completed.";
        case acrRuntimeErrorCodes.configuration:
        case acrRuntimeErrorCodes.unavailable:
        case acrRuntimeErrorCodes.upstream:
            return "Agent Context Runtime is temporarily unavailable.";
        case acrRuntimeErrorCodes.expired:
            return "This request has expired.";
        case acrRuntimeErrorCodes.incompatible:
            return "Agent Context Runtime needs a compatible service version.";
        case acrRuntimeErrorCodes.interpretationRejected:
            return "Dev could not accept an interpretation of your question. Try rephrasing it.";
        case acrRuntimeErrorCodes.invalidRequest:
            return "The context request is invalid.";
        case acrRuntimeErrorCodes.malformedResponse:
            return "Agent Context Runtime returned an invalid response.";
        case acrRuntimeErrorCodes.notEntitled:
            return "Agent Context Runtime is not available for this organization.";
        case acrRuntimeErrorCodes.rateLimited:
            return "Too many attempts. Please wait and try again.";
        case acrRuntimeErrorCodes.repositoryNotAvailable:
            return "The requested context is not available.";
        case acrRuntimeErrorCodes.responseTooLarge:
            return "Agent Context Runtime returned an oversized response.";
        case acrRuntimeErrorCodes.synthesisRejected:
            return "Dev could not accept a generated answer. Try rephrasing your question.";
        case acrRuntimeErrorCodes.timeout:
            return "Agent Context Runtime did not respond in time.";
        case acrRuntimeErrorCodes.unauthenticated:
            return "Authentication is required.";
    }
}
