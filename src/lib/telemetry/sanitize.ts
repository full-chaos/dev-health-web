import type { TelemetryPrimitive } from "./types";

const BLOCKED_KEYS = new Set([
    "email",
    "name",
    "username",
    "userName",
    "userId",
    "orgId",
    "url",
    "href",
    "query",
    "search",
    "stack",
    "message",
    "title",
    "body",
]);

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
// Ids, dotted names and route patterns ("/people/[person_id]"): no space, "@", "?", "#", "%", "+" or non-ASCII.
const VALUE_RE = /^[A-Za-z0-9_./:[\]-]{1,128}$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// A long unbroken letter/digit run reads as a token or an opaque id, never as a code-owned name.
const TOKEN_RUN_RE = /[A-Za-z0-9]{24,}/;

export type SanitizedTelemetryPayload =
    { ok: true; payload: Record<string, TelemetryPrimitive> } | { ok: false; key: string };

/** The value when it is a bounded id-shaped string, else null. */
export function boundTelemetryString(value: string): string | null {
    if (
        !VALUE_RE.test(value) ||
        value.includes("//") ||
        UUID_RE.test(value) ||
        TOKEN_RUN_RE.test(value)
    ) {
        return null;
    }
    return value;
}

/**
 * Fail closed: a string or number outside the bounds, or any other value (undefined, an object, an array, a function), rejects the whole event (`ok: false`, the
 * offending key only, never the value), so a typed event never loses a required field.
 */
export function sanitizeTelemetryPayload(
    payload: Record<string, unknown>,
): SanitizedTelemetryPayload {
    const sanitized: Record<string, TelemetryPrimitive> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (BLOCKED_KEYS.has(key) || !KEY_RE.test(key)) continue;
        if (typeof value === "string") {
            if (boundTelemetryString(value) === null) return { ok: false, key };
            sanitized[key] = value;
        } else if (typeof value === "number") {
            if (!Number.isFinite(value)) return { ok: false, key };
            sanitized[key] = value;
        } else if (typeof value === "boolean" || value === null) {
            sanitized[key] = value;
        } else {
            return { ok: false, key };
        }
    }
    return { ok: true, payload: sanitized };
}
