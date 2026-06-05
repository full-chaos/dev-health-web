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

export function sanitizeTelemetryPayload(
    payload: Record<string, unknown>,
): Record<string, TelemetryPrimitive> {
    const sanitized: Record<string, TelemetryPrimitive> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (BLOCKED_KEYS.has(key)) continue;
        if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value === null
        ) {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
