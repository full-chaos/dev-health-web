import { logger } from "@/lib/logger";

const log = logger.child({ module: "auth-session" });

/**
 * Every branch of the session token life cycle that takes a token away from a
 * session, or keeps a session on a fallback (CHAOS-8443).
 *
 * - `refresh_failed`        the backend answered 401 to the refresh token: both tokens go.
 * - `refresh_unavailable`   the refresh got another non-2xx answer: the access token goes,
 *                           the refresh token stays for a retry after backoff.
 * - `refresh_call_failed`   the refresh call threw (network, unreadable body): same as above.
 * - `refresh_no_access_token` the refresh answered 2xx with no access token in the body: the
 *                           access token goes and no error is set.
 * - `user_invalid`          backend validation refused the session (a 2xx with `valid: false`,
 *                           or 401 / 403): both tokens go.
 * - `validate_transient`    validation got an answer that says nothing about the user (404, 400,
 *                           422, 429, 5xx, a body without `valid`): the session is KEPT, retry
 *                           after backoff.
 * - `validate_call_failed`  the validation call threw: the session is KEPT, retry after backoff.
 */
export type SessionBranch =
    | "refresh_failed"
    | "refresh_unavailable"
    | "refresh_call_failed"
    | "refresh_no_access_token"
    | "user_invalid"
    | "validate_transient"
    | "validate_call_failed";

export interface SessionBranchFields {
    readonly operation: "refresh" | "validate";
    readonly branch: SessionBranch;
    /** HTTP status of the backend answer. Absent when no answer arrived. */
    readonly status?: number;
    /** The `name` of a thrown error, for example `TypeError`. Never its message. */
    readonly errorName?: string;
    /** Consecutive failures of this operation for this token, this one included. */
    readonly failures?: number;
}

const MESSAGES: Record<SessionBranch, string> = {
    refresh_failed: "session ended: the backend refused the refresh token",
    refresh_unavailable:
        "access token dropped: the refresh got no usable answer; retry after backoff",
    refresh_call_failed: "access token dropped: the refresh call failed; retry after backoff",
    refresh_no_access_token: "access token dropped: the refresh answer carried no access token",
    user_invalid: "session ended: backend validation refused the session",
    validate_transient:
        "session kept: backend validation got no usable answer; retry after backoff",
    validate_call_failed: "session kept: the backend validation call failed; retry after backoff",
};

/**
 * One warn line per backend call that changes, or declines to change, what a
 * session holds. The fields are a closed set: operation, branch, status, error
 * name and failure count. A token, a cookie, an e-mail address and any text the
 * backend served must never be passed here; the logger adds the time.
 */
export function logSessionBranch(fields: SessionBranchFields): void {
    // A log line must never change what the caller does with the session. The
    // refresh branches call this inside their own `try`, where a logger that
    // throws would send a 401 down the "call failed" path, and the "call
    // failed" path would then throw out of the JWT callback.
    try {
        // The five fields by name: nothing else a caller passes is written.
        const line: Record<string, string | number> = {
            operation: fields.operation,
            branch: fields.branch,
        };
        if (fields.status !== undefined) line.status = fields.status;
        if (fields.errorName !== undefined) line.errorName = fields.errorName;
        if (fields.failures !== undefined) line.failures = fields.failures;
        log.warn(line, MESSAGES[fields.branch]);
    } catch {
        // There is no second channel to report a failed log line on; the
        // session logic goes on unchanged.
    }
}

/**
 * The `name` of a thrown error, for a log line (`typeof` for a thrown value that
 * is not an Error). Never the message.
 */
export function thrownErrorName(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
}
