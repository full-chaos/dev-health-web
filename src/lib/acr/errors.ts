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
    // Ask Dev (CHAOS-11921): the org is entitled but has no repository in scope.
    noRepository: "no_repository",
    // Ask Dev (CHAOS-11921): a mutating call whose `Origin` is not this site.
    originRefused: "origin_refused",
    // Ask Dev deadline chain (CHAOS-3608), web-origin terminals: setup left less than ACR's
    // minimum wait budget; no upstream bytes for the stall window; the run reached its deadline.
    budgetExhausted: "budget_exhausted",
    stalled: "stalled",
    interrupted: "interrupted",
    // CHAOS-12201: ACR's per-call access read refused the user (error.v1 `access_denied`, 403), and
    // the shared Ask Dev limits (429): running questions, and the monthly allowance.
    accessDenied: "access_denied",
    concurrencyLimited: "concurrency_limited",
    allowanceExhausted: "allowance_exhausted",
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
        // CHAOS-12201: the conversation store says the same words (`NOT_RUN_COPY`); a test holds them equal.
        case acrRuntimeErrorCodes.accessDenied:
            return "Ask Dev is not available in this session. Sign in again with your own account in this organization.";
        case acrRuntimeErrorCodes.concurrencyLimited:
            return "Too many questions are running. Wait for one to finish, then ask again.";
        case acrRuntimeErrorCodes.allowanceExhausted:
            return "Your organization has used this month's Ask Dev allowance.";
        case acrRuntimeErrorCodes.budgetExhausted:
            return "Dev ran out of time before the question could start. Ask again.";
        case acrRuntimeErrorCodes.stalled:
            return "The answer stopped arriving. Ask again.";
        case acrRuntimeErrorCodes.interrupted:
            return "The run was interrupted before it finished. Ask again.";
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
        case acrRuntimeErrorCodes.noRepository:
            return "No repository is available to you here. Connect a repository, or ask an admin for access to one.";
        case acrRuntimeErrorCodes.originRefused:
            return "The request was rejected.";
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
