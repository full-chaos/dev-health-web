import { scrubTelemetryPayload, scrubTelemetryText } from "@/lib/sentry/scrubber-value";

export { scrubTelemetryText as scrubLogText };

function plainError(error: Error): Record<string, string | undefined> {
    return { type: error.name, message: error.message, stack: error.stack };
}

/**
 * The fields of one log line, scrubbed. An error keeps its name, message and stack, and loses its
 * own properties (a response, a request, a header map); every string goes through the telemetry
 * scrubber.
 */
export function scrubLogFields<T extends object>(fields: T): T {
    const flat = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
            key,
            value instanceof Error ? plainError(value) : value,
        ]),
    );
    return scrubTelemetryPayload(flat) as T;
}
