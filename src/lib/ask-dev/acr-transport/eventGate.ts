import {
    INVESTIGATION_STAGES,
    type InvestigationEvent,
    type InvestigationStage,
} from "@/components/ask-dev/conversation/transport";
import { asTranscriptResult } from "@/components/ask-dev/answer/testModeAnswer";

import { ACR_MAX_SILENCE_MS } from "./limits";
import type { SseEvent } from "./sseParser";

/**
 * The gate every ACR investigation event passes in the browser before the conversation store sees
 * it (CHAOS-12104, T14a; design amendment §6; plan §2.7.2, §2.7.7). Each event is parsed, checked
 * against the pinned `context_fabric_investigation_event.v1` schema (generated standalone code: no
 * eval under the production CSP), and then against the stream's own grammar:
 *
 * - the first event is `accepted` with `seq` 1, and no later event is `accepted`;
 * - every `seq` is the previous one plus 1 (a gap is a lost event, never passed on);
 * - the SSE `event` field is the event's `type`, and the SSE `id` field is its `seq`;
 * - the outer `request_id` stays the one of `accepted` (a reused result's nested `request_id` may
 *   differ: only the outer one is checked);
 * - `elapsed_ms` never goes back, on the events that carry it (`stage`, `heartbeat`), and no two
 *   consecutive values (`accepted` counting as 0) are more than 11 s apart;
 * - stages follow their one order, each `started` then `completed`, a stage may be skipped, and no
 *   stage starts while another is open;
 * - a `heartbeat` names the open stage, or none when none is open;
 * - a `result` comes with no stage open;
 * - an `error` names the `reserved_result_id` of `accepted`, and the last stage started (or none
 *   when none started);
 * - `accepted` names the thread and the submission the request sent;
 * - a `result` is a transcript result the views can read.
 *
 * These are the rules of ACR's own stream check (`ContextFabricInvestigationEventStreamCheck`, in
 * `internal/contracts/v1`), which its route writer and its consumer tests share.
 *
 * Any break before a valid terminal is `invalid`: the transport aborts and the run ends with
 * `invalid_upstream`. After the terminal, a later event is reported as `after_terminal`: it is
 * dropped and logged, and the transport closes the stream.
 */

export type InvalidEventReason =
    | "bad_json"
    | "schema"
    | "event_field"
    | "id_field"
    | "first_not_accepted"
    | "accepted_repeated"
    | "seq_gap"
    | "request_id_changed"
    | "elapsed_regressed"
    | "silence"
    | "stage_order"
    | "heartbeat_stage"
    | "result_stage_open"
    | "error_stage"
    | "reserved_mismatch"
    | "thread_mismatch"
    | "submission_mismatch"
    | "result_shape";

export type GateVerdict =
    | { readonly kind: "event"; readonly event: InvestigationEvent; readonly terminal: boolean }
    | { readonly kind: "after_terminal"; readonly eventType: string }
    // `eventType` is one of the closed event types, or "unknown".
    | { readonly kind: "invalid"; readonly reason: InvalidEventReason; readonly seq?: number };

/** What the request sent, which `accepted` must name back. */
export type GateRequest = {
    readonly threadId: string;
    readonly submissionId: string;
};

type Wire = {
    readonly type: string;
    readonly seq: number;
    readonly request_id: string;
    readonly reserved_result_id?: string;
    readonly thread_id?: string;
    readonly submission_id?: string;
    readonly stage?: InvestigationStage;
    readonly state?: "started" | "completed";
    readonly elapsed_ms?: number;
    readonly result?: unknown;
};

const stageIndex = (stage: InvestigationStage): number => INVESTIGATION_STAGES.indexOf(stage);

/** The closed event types: anything else is logged as `unknown`, never as wire text. */
const EVENT_TYPES = new Set(["accepted", "stage", "heartbeat", "result", "error"]);

export class InvestigationEventGate {
    private seq = 0;
    private requestId: string | undefined;
    private reserved: string | undefined;
    /** The last `elapsed_ms`; `accepted` counts as 0. */
    private elapsed = 0;
    /** The index of the last stage that started, and whether it is still open. */
    private lastStage = -1;
    private stageOpen = false;
    private terminalType: "result" | "error" | undefined;

    constructor(
        private readonly validate: (value: unknown) => boolean,
        private readonly request: GateRequest,
    ) {}

    /** The `seq` of the last event passed on; 0 before the first. */
    get lastSeq(): number {
        return this.seq;
    }

    /** Whether a valid terminal was passed on. */
    get ended(): boolean {
        return this.terminalType !== undefined;
    }

    accept(frame: SseEvent): GateVerdict {
        if (this.terminalType !== undefined) return this.afterTerminal(frame);
        let value: unknown;
        try {
            value = JSON.parse(frame.data);
        } catch {
            return { kind: "invalid", reason: "bad_json" };
        }
        if (!this.validate(value)) return { kind: "invalid", reason: "schema" };
        const event = value as Wire;
        const { seq } = event;
        const invalid = (reason: InvalidEventReason): GateVerdict => ({
            kind: "invalid",
            reason,
            seq,
        });
        if (frame.event !== event.type) return invalid("event_field");
        if (frame.id !== String(seq)) return invalid("id_field");
        if (this.seq === 0) {
            if (event.type !== "accepted" || seq !== 1) return invalid("first_not_accepted");
            if (event.thread_id !== this.request.threadId) return invalid("thread_mismatch");
            if (
                event.submission_id !== undefined &&
                event.submission_id !== this.request.submissionId
            ) {
                return invalid("submission_mismatch");
            }
        } else {
            if (event.type === "accepted") return invalid("accepted_repeated");
            if (seq !== this.seq + 1) return invalid("seq_gap");
            if (event.request_id !== this.requestId) return invalid("request_id_changed");
        }
        if (event.elapsed_ms !== undefined) {
            if (event.elapsed_ms < this.elapsed) return invalid("elapsed_regressed");
            if (event.elapsed_ms - this.elapsed > ACR_MAX_SILENCE_MS) return invalid("silence");
        }
        if (event.type === "stage" && !this.stageMoves(event)) return invalid("stage_order");
        if (event.type === "heartbeat" && event.stage !== this.openStage()) {
            return invalid("heartbeat_stage");
        }
        if (event.type === "result" && this.stageOpen) return invalid("result_stage_open");
        if (event.type === "error" && event.reserved_result_id !== this.reserved) {
            return invalid("reserved_mismatch");
        }
        if (event.type === "error" && event.stage !== this.lastStarted()) {
            return invalid("error_stage");
        }
        if (event.type === "result" && asTranscriptResult(event.result) === null) {
            return invalid("result_shape");
        }
        // Valid: commit.
        this.seq = seq;
        if (event.elapsed_ms !== undefined) this.elapsed = event.elapsed_ms;
        if (event.type === "accepted") {
            this.requestId = event.request_id;
            this.reserved = event.reserved_result_id;
        }
        if (event.type === "stage") this.moveStage(event);
        const terminal = event.type === "result" || event.type === "error";
        if (terminal) this.terminalType = event.type as "result" | "error";
        return { kind: "event", event: value as InvestigationEvent, terminal };
    }

    private lastStarted(): InvestigationStage | undefined {
        return this.lastStage < 0 ? undefined : INVESTIGATION_STAGES[this.lastStage];
    }

    private openStage(): InvestigationStage | undefined {
        return this.stageOpen ? this.lastStarted() : undefined;
    }

    /** `started` only for a later stage while none is open; `completed` only for the open one. */
    private stageMoves(event: Wire): boolean {
        const index = stageIndex(event.stage!);
        if (event.state === "started") return !this.stageOpen && index > this.lastStage;
        return this.stageOpen && index === this.lastStage;
    }

    private moveStage(event: Wire): void {
        if (event.state === "started") {
            this.lastStage = stageIndex(event.stage!);
            this.stageOpen = true;
        } else {
            this.stageOpen = false;
        }
    }

    private afterTerminal(frame: SseEvent): GateVerdict {
        let type: unknown;
        try {
            type = (JSON.parse(frame.data) as { type?: unknown } | null)?.type;
        } catch {
            type = undefined;
        }
        const named = typeof type === "string" ? type : frame.event;
        return {
            kind: "after_terminal",
            eventType: named !== undefined && EVENT_TYPES.has(named) ? named : "unknown",
        };
    }
}
