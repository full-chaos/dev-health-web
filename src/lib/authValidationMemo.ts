import type { JWT } from "next-auth/jwt";
import { logSessionBranch, thrownErrorName } from "@/lib/authSessionLog";
import { getBackendUrl } from "@/lib/origin";
import { processMemo } from "@/lib/processMemo";

const VALIDATION_INTERVAL_MS = 5 * 60 * 1000;
const VALIDATION_BACKOFF_BASE_MS = 60 * 1000;
const VALIDATION_BACKOFF_CAP_MS = 15 * 60 * 1000;
const VALIDATION_BACKOFF_FLOOR_MS = 5 * 1000;

type ValidationOutcome =
    | { readonly kind: "valid"; readonly checkedAt: number }
    | { readonly kind: "transient"; readonly retryAfter: number; readonly failures: number }
    | { readonly kind: "invalid" };

type ValidationMemoEntry =
    | { readonly kind: "inFlight"; readonly promise: Promise<ValidationOutcome> }
    | { readonly kind: "valid"; readonly validUntil: number; readonly checkedAt: number }
    | { readonly kind: "transient"; readonly retryAfter: number; readonly failures: number };

// One Map per process, not per bundle: the proxy, the page render and the route handlers share it.
const validationMemo = processMemo<ValidationMemoEntry>("authValidationMemo");

export async function applyBackendValidationMemo(token: JWT, now: number): Promise<void> {
    const accessToken = token.access_token;
    if (!accessToken) return;

    const memoKey = await validationMemoKey(accessToken);
    const memoized = validationMemo.get(memoKey);

    if (memoized?.kind === "valid" && memoized.validUntil > now) {
        applyValidationOutcome(token, { kind: "valid", checkedAt: now });
        return;
    }

    if (memoized?.kind === "transient" && memoized.retryAfter > now) {
        applyValidationOutcome(token, {
            kind: "transient",
            retryAfter: memoized.retryAfter,
            failures: memoized.failures,
        });
        return;
    }

    if (memoized?.kind === "inFlight") {
        applyValidationOutcome(token, await memoized.promise);
        return;
    }

    const memoFailures = memoized?.kind === "transient" ? memoized.failures : 0;
    const promise = validateBackendSession(
        accessToken,
        Math.max(validationFailureCount(token), memoFailures) + 1,
        now,
    );
    validationMemo.set(memoKey, { kind: "inFlight", promise });

    const outcome = await promise;
    if (outcome.kind === "valid") {
        validationMemo.set(memoKey, {
            kind: "valid",
            checkedAt: outcome.checkedAt,
            validUntil: outcome.checkedAt + VALIDATION_INTERVAL_MS,
        });
    } else if (outcome.kind === "transient") {
        validationMemo.set(memoKey, {
            kind: "transient",
            retryAfter: outcome.retryAfter,
            failures: outcome.failures,
        });
    } else {
        validationMemo.delete(memoKey);
    }

    applyValidationOutcome(token, outcome);
}

export function resetValidationMemoForTests(): void {
    validationMemo.clear();
}

async function validateBackendSession(
    accessToken: string,
    failures: number,
    now: number,
): Promise<ValidationOutcome> {
    try {
        const backendUrl = getBackendUrl();
        const res = await fetch(`${backendUrl}/api/v1/auth/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: accessToken }),
        });

        // The session ends only on an answer that refuses it (CHAOS-8444):
        //  - a 2xx body with `valid: false`, the one way the validate endpoint
        //    says "this user is no longer valid";
        //  - 401 or 403. The endpoint does not send them today, but a refusal
        //    of the credentials must never keep a session.
        // Every other answer says nothing about the user: a 404 from a router
        // that has no backend during a roll, a 400 or 422, a 429, a 5xx, a 2xx
        // body without a boolean `valid` (a body that is not JSON included).
        // Those keep the session, are logged with their status, and validation
        // is retried after backoff. The access token still expires on its own
        // clock, and then the refresh path decides.
        if (res.ok) {
            const verdict = validVerdict(await readJson(res));
            if (verdict === true) return { kind: "valid", checkedAt: now };
            if (verdict === false) {
                logSessionBranch({
                    operation: "validate",
                    branch: "user_invalid",
                    status: res.status,
                });
                return { kind: "invalid" };
            }
        } else if (res.status === 401 || res.status === 403) {
            logSessionBranch({ operation: "validate", branch: "user_invalid", status: res.status });
            return { kind: "invalid" };
        }

        logSessionBranch({
            operation: "validate",
            branch: "validate_transient",
            status: res.status,
            failures,
        });
        return transientOutcome(failures, now);
    } catch (error) {
        logSessionBranch({
            operation: "validate",
            branch: "validate_call_failed",
            errorName: thrownErrorName(error),
            failures,
        });
        return transientOutcome(failures, now);
    }
}

/**
 * The JSON body of an answer, or undefined when it cannot be read. An answer
 * that arrived but is not JSON is not a failed call: the caller logs it with
 * its status, not as a network failure.
 */
async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return undefined;
    }
}

/** The boolean `valid` of a validate answer, or undefined when the body does not carry one. */
function validVerdict(body: unknown): boolean | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const valid = (body as { valid?: unknown }).valid;
    return typeof valid === "boolean" ? valid : undefined;
}

function transientOutcome(failures: number, now: number): ValidationOutcome {
    const cappedDelay = Math.min(
        VALIDATION_BACKOFF_CAP_MS,
        VALIDATION_BACKOFF_BASE_MS * Math.pow(2, failures - 1),
    );
    const jitteredDelay =
        VALIDATION_BACKOFF_FLOOR_MS + Math.random() * (cappedDelay - VALIDATION_BACKOFF_FLOOR_MS);
    return { kind: "transient", retryAfter: now + jitteredDelay, failures };
}

function validationFailureCount(token: JWT): number {
    return typeof token.validation_failures === "number" ? token.validation_failures : 0;
}

function applyValidationOutcome(token: JWT, outcome: ValidationOutcome): void {
    if (outcome.kind === "valid") {
        token.last_validated = outcome.checkedAt;
        token.validation_failures = 0;
        return;
    }

    if (outcome.kind === "transient") {
        token.validation_failures = outcome.failures;
        token.last_validated = outcome.retryAfter - VALIDATION_INTERVAL_MS;
        return;
    }

    token.access_token = undefined;
    token.refresh_token = undefined;
    token.error = "user_invalid";
}

async function validationMemoKey(accessToken: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(accessToken),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
}
