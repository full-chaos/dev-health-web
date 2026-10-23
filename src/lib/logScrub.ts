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

/**
 * pino `logMethod` hook: the message and its format arguments are scrubbed here, because the log
 * formatter only sees the merged fields. An error-first call becomes `{ err }` plus its message.
 */
export function scrubLogCall(
    this: unknown,
    args: unknown[],
    method: (...rest: unknown[]) => void,
): void {
    const scrub = (arg: unknown) => (typeof arg === "string" ? scrubTelemetryText(arg) : arg);
    const [first, second, ...rest] = args;
    if (first instanceof Error) {
        method.apply(this, [{ err: first }, scrub(second ?? first.message), ...rest.map(scrub)]);
        return;
    }
    method.apply(this, args.map(scrub));
}
