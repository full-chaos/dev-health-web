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
} as const;

export type AcrRuntimeErrorCode = (typeof acrRuntimeErrorCodes)[keyof typeof acrRuntimeErrorCodes];

type AcrRuntimeErrorOptions = {
    readonly cause?: unknown;
    readonly retryable?: boolean;
    readonly status?: number;
};

export class AcrRuntimeError extends Error {
    readonly name = "AcrRuntimeError";
    readonly status: number;
    readonly retryable: boolean;

    constructor(
        readonly code: AcrRuntimeErrorCode,
        message: string,
        options: AcrRuntimeErrorOptions = {},
    ) {
        super(message, { cause: options.cause });
        this.status = options.status ?? 503;
        this.retryable = options.retryable ?? false;
    }
}

export function isAcrRuntimeError(error: unknown): error is AcrRuntimeError {
    return error instanceof AcrRuntimeError;
}

export function safeAcrRuntimeMessage(code: AcrRuntimeErrorCode): string {
    switch (code) {
        case acrRuntimeErrorCodes.configuration:
        case acrRuntimeErrorCodes.unavailable:
        case acrRuntimeErrorCodes.upstream:
            return "Agent Context Runtime is temporarily unavailable.";
        case acrRuntimeErrorCodes.incompatible:
            return "Agent Context Runtime needs a compatible service version.";
        case acrRuntimeErrorCodes.invalidRequest:
            return "The context request is invalid.";
        case acrRuntimeErrorCodes.malformedResponse:
            return "Agent Context Runtime returned an invalid response.";
        case acrRuntimeErrorCodes.notEntitled:
            return "Agent Context Runtime is not available for this organization.";
        case acrRuntimeErrorCodes.repositoryNotAvailable:
            return "The requested context is not available.";
        case acrRuntimeErrorCodes.responseTooLarge:
            return "Agent Context Runtime returned an oversized response.";
        case acrRuntimeErrorCodes.timeout:
            return "Agent Context Runtime did not respond in time.";
        case acrRuntimeErrorCodes.unauthenticated:
            return "Authentication is required.";
    }
}
