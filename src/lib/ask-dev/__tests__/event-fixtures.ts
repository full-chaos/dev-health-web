import { readFileSync } from "node:fs";

/**
 * Investigation event stream fixtures for the Ask Dev proxy tests (CHAOS-11925).
 *
 * `context_fabric_investigation_event_stream.v1.sse` is a real producer capture: the raw bytes ACR
 * (acr main eabe6e6c, kiac askdev-1, stream flag on) wrote for one investigation on 2026-10-30 —
 * accepted, all five stages, two heartbeats, the result. Only the `result` payload was swapped for
 * the vendored canonical result capture (`context_fabric_investigation_result.v1.json`), so no
 * organization data enters the repository; every frame, id, seq, timestamp and the framing bytes
 * are ACR's own.
 */
export const STREAM_CAPTURE = readFileSync(
    new URL("./captures/context_fabric_investigation_event_stream.v1.sse", import.meta.url),
    "utf8",
);

type EventObject = Record<string, unknown> & { readonly seq: number; readonly type: string };

/** The captured events, in order, as ACR wrote them. */
export const CAPTURED_EVENTS: readonly EventObject[] = STREAM_CAPTURE.split("\n\n")
    .filter((frame) => frame !== "")
    .map((frame) => {
        const data = frame.split("\n").find((line) => line.startsWith("data: "));
        if (data === undefined) throw new Error("capture frame without data");
        return JSON.parse(data.slice("data: ".length)) as EventObject;
    });

function captured(type: string): EventObject {
    const event = CAPTURED_EVENTS.find((candidate) => candidate.type === type);
    if (event === undefined) throw new Error(`capture has no ${type} event`);
    return event;
}

const ACCEPTED = captured("accepted");
const BASE = { request_id: ACCEPTED.request_id, schema_version: ACCEPTED.schema_version };

/** One frame as ACR writes it: `id`, `event`, one line of compact JSON, a blank line. */
export function acrFrame(event: EventObject): string {
    return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function acceptedEvent(): EventObject {
    return { ...ACCEPTED };
}

export function stageEvent(seq: number, stage: string, state: string, elapsedMs: number) {
    return { ...BASE, elapsed_ms: elapsedMs, seq, stage, state, type: "stage" };
}

export function heartbeatEvent(seq: number, elapsedMs: number): EventObject {
    return { ...BASE, elapsed_ms: elapsedMs, seq, type: "heartbeat" };
}

export function resultEvent(seq: number): EventObject {
    return { ...captured("result"), seq };
}

export function errorEvent(seq: number, code = "internal_error"): EventObject {
    return {
        ...BASE,
        error: {
            error: { code, http_status: 500, message: "redacted", retryable: false },
            request_id: ACCEPTED.request_id,
            schema_version: "error.v1",
        },
        reserved_result_id: ACCEPTED.reserved_result_id,
        seq,
        type: "error",
    };
}

/** ACR frames for the given events, joined. */
export function acrStream(...events: readonly EventObject[]): string {
    return events.map(acrFrame).join("");
}
