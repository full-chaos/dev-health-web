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
    | "user_invalid"
    | "validate_transient"
    | "validate_call_failed";

export interface SessionBranchFields {
    readonly operation: "refresh" | "validate";
    readonly branch: SessionBranch;
    /** HTTP status of the backend answer. Absent when no answer arrived. */
    readonly status?: number;
    /** Constructor name of a thrown error. Never its message. */
    readonly errorName?: string;
    /** Consecutive failures of this operation for this token, this one included. */
    readonly failures?: number;
}

const MESSAGES: Record<SessionBranch, string> = {
    refresh_failed: "session ended: the backend refused the refresh token",
    refresh_unavailable:
        "access token dropped: the refresh got no usable answer; retry after backoff",
    refresh_call_failed: "access token dropped: the refresh call failed; retry after backoff",
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
    log.warn({ ...fields }, MESSAGES[fields.branch]);
}

/** The constructor name of a thrown value, for a log line. Never the message. */
export function thrownErrorName(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
}
