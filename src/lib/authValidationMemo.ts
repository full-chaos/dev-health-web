import type { JWT } from "next-auth/jwt";
import { getBackendUrl } from "@/lib/origin";

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

const validationMemo = new Map<string, ValidationMemoEntry>();

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

        if (res.ok) {
            const data = await res.json();
            return data.valid ? { kind: "valid", checkedAt: now } : { kind: "invalid" };
        }

        if (res.status === 429 || res.status >= 500) {
            return transientOutcome(failures, now);
        }

        return { kind: "invalid" };
    } catch {
        return transientOutcome(failures, now);
    }
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
