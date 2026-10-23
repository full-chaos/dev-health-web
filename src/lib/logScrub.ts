import { scrubTelemetryPayload, scrubTelemetryText } from "@/lib/sentry/scrubber-value";

export { scrubTelemetryText as scrubLogText };

const MAX_PLAIN_DEPTH = 8;

function plainError(error: Error): Record<string, string | undefined> {
    return { type: error.name, message: error.message, stack: error.stack };
}

// An error at any depth keeps name, message and stack; its own properties (a response, a request, a
// header map, a cause) are dropped. The scrubber walks the result.
function plainify(value: unknown, depth: number, active: WeakSet<object>): unknown {
    if (value instanceof Error) return plainError(value);
    // A function is never printed, and an own `toJSON` would let pino print what the scrubber never saw.
    if (typeof value === "function") return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value !== "object" || value === null || depth >= MAX_PLAIN_DEPTH) return value;
    if (active.has(value)) return value;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
    active.add(value);
    try {
        if (Array.isArray(value)) return value.map((item) => plainify(item, depth + 1, active));
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, plainify(item, depth + 1, active)]),
        );
    } catch {
        return "[Filtered]";
    } finally {
        active.delete(value);
    }
}

/** The fields of one log line, scrubbed: errors reduced at any depth, every string scrubbed. */
export function scrubLogFields<T extends object>(fields: T): T {
    return scrubTelemetryPayload(plainify(fields, 0, new WeakSet()) as T);
}

// A message or a format argument that is not a string is turned into scrubbed text here, because
// pino prints it with String() after the hook has run. Numbers and booleans stay as they are.
function scrubbedText(arg: unknown): unknown {
    if (typeof arg === "string") return scrubTelemetryText(arg);
    if (
        arg === null ||
        arg === undefined ||
        typeof arg === "number" ||
        typeof arg === "boolean" ||
        typeof arg === "bigint"
    )
        return arg;
    try {
        if (arg instanceof Error) return scrubTelemetryText(arg.message);
        return scrubTelemetryText(String(arg));
    } catch {
        return "[Filtered]";
    }
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
    const [first, second, ...rest] = args;
    if (first instanceof Error) {
        method.apply(this, [
            { err: first },
            scrubbedText(second ?? first.message),
            ...rest.map(scrubbedText),
        ]);
        return;
    }
    if (typeof first === "object" && first !== null) {
        method.apply(this, [first, ...args.slice(1).map(scrubbedText)]);
        return;
    }
    method.apply(this, args.map(scrubbedText));
}
