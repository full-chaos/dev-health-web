import { logger } from "@/lib/logger";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";

/** The one sentence a failed ACTION (save, delete, toggle, run) shows when no validation text applies. */
export const ACTION_FAILED_MESSAGE = "The change was not saved. Try again.";

/** A plan-gate answer is a product sentence, not an error; it passes through (shown in a warn notice). */
const PLAN_GATE = /^This feature requires the /u;

/** A 4xx other than 401/403: a validation-style answer whose message the user must act on. */
export function isValidationStatus(status: number | undefined): boolean {
    return (
        status !== undefined && status >= 400 && status < 500 && status !== 401 && status !== 403
    );
}

/** True for a plan-gate sentence ("This feature requires the …"): product copy, safe to show. */
export function isPlanGateMessage(message: string | undefined | null): message is string {
    return typeof message === "string" && PLAN_GATE.test(message);
}

export type FailureKind = "read" | "action";

/** An error this app authored for the user (a product sentence, never backend text): shown as is. */
export class UserFacingActionError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
        this.name = "UserFacingActionError";
    }
}

/** A GET is a read; any other method (or an unknown one) is an action. */
export function kindOfMethod(method: string | undefined): FailureKind {
    return method?.toUpperCase() === "GET" ? "read" : "action";
}

export type FailureResult = { error: string; status?: number };

/**
 * The failed result of a server action or a server read. The served text (`served`) survives only
 * for a validation answer (4xx except 401/403) of an ACTION, or a plan-gate sentence. Everything
 * else is one plain sentence: "Could not be read" for a read, "The change was not saved. Try
 * again." for an action. The raw error goes to the server log with the operation name.
 */
export function failureResult(
    kind: FailureKind,
    operation: string,
    detail: { status?: number; served?: unknown; error?: unknown; userFacing?: boolean },
): FailureResult {
    const served = typeof detail.served === "string" ? detail.served : undefined;
    const status = detail.status;
    if (served && (detail.userFacing || PLAN_GATE.test(served))) {
        return { error: served, ...(status !== undefined ? { status } : {}) };
    }
    if (kind === "action" && served && isValidationStatus(status)) {
        return { error: served, status };
    }
    logger.error({ err: detail.error ?? served, status, operation }, "Server call failed");
    return {
        error: kind === "read" ? READ_FAILED_MESSAGE : ACTION_FAILED_MESSAGE,
        ...(status !== undefined ? { status } : {}),
    };
}

/**
 * The plain sentence for a thrown error of an ACTION on the client (a form submit, a toggle, a
 * delete). The error goes to the log with the operation name. A client has no HTTP status for a
 * thrown error, so the served text is never shown from here; a server action that wants to show a
 * validation answer returns it through `failureResult`.
 */
export function actionFailureMessage(error: unknown, operation: string): string {
    logger.error({ err: error, operation }, "Action failed");
    return ACTION_FAILED_MESSAGE;
}

/**
 * The failed result for a thrown error of a server call. `AdminApiError` carries the HTTP status,
 * the served detail and the method (a GET is a read); `UserFacingActionError` carries an app-authored
 * sentence. Anything else (a network failure, a bug) is logged and shown as the plain sentence.
 */
export function failureFromError(operation: string, err: unknown): FailureResult {
    const e = err as { name?: unknown; status?: unknown; detail?: unknown; method?: unknown };
    const isApi = err instanceof Error && e.name === "AdminApiError";
    const isUserFacing = err instanceof UserFacingActionError;
    const status = (isApi || isUserFacing) && typeof e.status === "number" ? e.status : undefined;
    const served = isApi
        ? (e.detail as string | undefined) || (err as Error).message
        : isUserFacing
          ? err.message
          : undefined;
    return failureResult(
        isApi ? kindOfMethod(e.method as string | undefined) : "action",
        operation,
        {
            status,
            served,
            userFacing: isUserFacing,
            error: err,
        },
    );
}
