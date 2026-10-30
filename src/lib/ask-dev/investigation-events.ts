import { validateAcrContract } from "@/lib/acr/contracts";
import type { SseEvent } from "./sse-parser";

/**
 * The gate every ACR investigation event passes before web writes it to the browser (plan
 * §2.7.7). Each event is parsed and validated against the pinned
 * `context_fabric_investigation_event.v1` schema, which also validates the terminal `result`
 * (response v1 | v2 | answer projection) and `error` (`error.v1`). An event that passes is
 * written again from the parsed value: web never forwards raw upstream bytes.
 *
 * Stream rules web holds (ACR holds the full grammar on its own writes):
 *   - the first event is `accepted`, and only the first;
 *   - the SSE `event` field is the event's `type`, and the SSE `id` field is its `seq`;
 *   - `seq` increases strictly (a gap is passed on and reported, see `seqGap`);
 *   - after the first terminal (`result` or `error`) nothing more is written; a later event is
 *     dropped, and the caller logs it (a second terminal by name).
 */

const EVENT_SCHEMA = "context_fabric_investigation_event.v1.schema.json";

export const INVESTIGATION_EVENT_TYPES = [
    "accepted",
    "stage",
    "heartbeat",
    "result",
    "error",
] as const;

export type InvestigationEventType = (typeof INVESTIGATION_EVENT_TYPES)[number];

/** A schema-valid event. Only the fields the gate reads are typed. */
export type InvestigationEvent = {
    readonly schema_version: "context_fabric_investigation_event.v1";
    readonly type: InvestigationEventType;
    readonly request_id: string;
    readonly seq: number;
    readonly reserved_result_id?: string;
    readonly [field: string]: unknown;
};

export type InvalidEventReason =
    | "bad_json"
    | "schema"
    | "event_field"
    | "id_field"
    | "seq_not_increasing"
    | "first_not_accepted"
    | "accepted_repeated";

export type EventVerdict =
    | {
          readonly kind: "forward";
          /** The SSE frame web writes: `id`, `event` and one line of compact JSON. */
          readonly frame: string;
          readonly event: InvestigationEvent;
          readonly terminal: boolean;
          /**
           * How many `seq` values were skipped before this event (0 when none). ACR numbers every
           * event it writes, so a gap means an event was lost on the way; the event is still
           * written, and the caller logs the gap.
           */
          readonly seqGap: number;
      }
    | {
          readonly kind: "after_terminal";
          /** The dropped event's type when it names one of the closed set, else `unknown`. */
          readonly eventType: InvestigationEventType | "unknown";
          readonly duplicateTerminal: boolean;
      }
    | {
          readonly kind: "invalid";
          readonly reason: InvalidEventReason;
          /** The event's `seq` when the event got far enough to have one. */
          readonly seq?: number;
          /** Schema paths and messages only, never values. */
          readonly errors?: readonly string[];
      };

const MAX_LOGGED_SCHEMA_ERRORS = 5;

export function isTerminalEventType(type: InvestigationEventType): boolean {
    return type === "result" || type === "error";
}

function knownType(value: unknown): InvestigationEventType | undefined {
    return INVESTIGATION_EVENT_TYPES.find((type) => type === value);
}

/** The frame web writes for a validated event. `JSON.stringify` never writes a raw line break. */
export function serializeInvestigationEvent(event: InvestigationEvent): string {
    return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class InvestigationEventGate {
    private count = 0;
    private seq = 0;
    private terminalType: InvestigationEventType | undefined;
    private reserved: string | undefined;

    /** The `seq` of the last event written, 0 before the first. */
    get lastSeq(): number {
        return this.seq;
    }

    /** How many events were written. */
    get written(): number {
        return this.count;
    }

    /** The terminal written, if any. */
    get terminal(): InvestigationEventType | undefined {
        return this.terminalType;
    }

    /** `reserved_result_id` from `accepted`, for log lines. */
    get reservedResultId(): string | undefined {
        return this.reserved;
    }

    accept(frame: SseEvent): EventVerdict {
        if (this.terminalType !== undefined) return this.afterTerminal(frame);
        let value: unknown;
        try {
            value = JSON.parse(frame.data);
        } catch {
            return { kind: "invalid", reason: "bad_json" };
        }
        const verdict = validateAcrContract(EVENT_SCHEMA, value);
        if (!verdict.valid) {
            return {
                kind: "invalid",
                reason: "schema",
                errors: verdict.errors.slice(0, MAX_LOGGED_SCHEMA_ERRORS),
            };
        }
        const event = value as InvestigationEvent;
        const seq = event.seq;
        if (frame.event !== event.type) return { kind: "invalid", reason: "event_field", seq };
        if (frame.id !== String(seq)) return { kind: "invalid", reason: "id_field", seq };
        if (this.count === 0 && event.type !== "accepted") {
            return { kind: "invalid", reason: "first_not_accepted", seq };
        }
        if (this.count > 0 && event.type === "accepted") {
            return { kind: "invalid", reason: "accepted_repeated", seq };
        }
        if (seq <= this.seq) return { kind: "invalid", reason: "seq_not_increasing", seq };
        const seqGap = seq - this.seq - 1;
        this.count += 1;
        this.seq = seq;
        if (event.type === "accepted") this.reserved = event.reserved_result_id;
        const terminal = isTerminalEventType(event.type);
        if (terminal) this.terminalType = event.type;
        return {
            event,
            frame: serializeInvestigationEvent(event),
            kind: "forward",
            seqGap,
            terminal,
        };
    }

    private afterTerminal(frame: SseEvent): EventVerdict {
        let type: InvestigationEventType | undefined;
        try {
            type = knownType((JSON.parse(frame.data) as { type?: unknown } | null)?.type);
        } catch {
            type = undefined;
        }
        type ??= knownType(frame.event);
        return {
            duplicateTerminal: type !== undefined && isTerminalEventType(type),
            eventType: type ?? "unknown",
            kind: "after_terminal",
        };
    }
}
