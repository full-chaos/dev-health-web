import { describe, expect, it } from "vitest";

import { validateInvestigationEventEnvelope } from "@/lib/acr/streamEnvelopeValidators";

import { InvestigationEventGate, type GateVerdict } from "../eventGate";
import { SseParser, type SseEvent } from "../sseParser";
import { MAX_EVENT_BYTES } from "../limits";
import {
    acceptedEvent,
    acrFrame,
    CAPTURED_EVENTS,
    errorEvent,
    heartbeatEvent,
    resultEvent,
    stageEvent,
} from "./eventFixtures";

/**
 * CHAOS-12104 (T14a): the browser's stream grammar, on the real ACR capture (#1608) and on edits
 * of it, through the generated envelope check of `context_fabric_investigation_event.v1` (the one
 * the transport gives the gate; the full check of a result is the transport's, option (c)).
 */

const THREAD = "thread_e2e_gate_00000001";
const ACCEPTED = acceptedEvent();
const SUBMISSION = String(ACCEPTED.submission_id);
/** ACR writes `thread_id` in `accepted` since T9; the capture predates it, so it is added. */
const accepted = () => ({ ...acceptedEvent(), thread_id: THREAD });

type EventObject = Record<string, unknown> & { readonly seq: number; readonly type: string };

const frameOf = (event: EventObject): SseEvent => {
    const parser = new SseParser(MAX_EVENT_BYTES);
    const [frame] = parser.push(new TextEncoder().encode(acrFrame(event)));
    return frame!;
};

function gate(validate: (value: unknown) => boolean = validateInvestigationEventEnvelope) {
    return new InvestigationEventGate(validate, { threadId: THREAD, submissionId: SUBMISSION });
}

/** Feeds events in order and returns each verdict. */
function feed(events: readonly EventObject[], g = gate()): GateVerdict[] {
    return events.map((event) => g.accept(frameOf(event)));
}

const kinds = (verdicts: readonly GateVerdict[]) =>
    verdicts.map((v) => (v.kind === "invalid" ? `invalid:${v.reason}` : v.kind));

/** The captured run, `accepted` with its thread. */
const CAPTURED = CAPTURED_EVENTS.map((event, index) =>
    index === 0 ? { ...event, thread_id: THREAD } : event,
) as EventObject[];

describe("the real capture passes, every event in order", () => {
    it("passes every captured event and ends on the result", () => {
        const g = gate();
        const verdicts = feed(CAPTURED, g);
        expect(kinds(verdicts).every((kind) => kind === "event")).toBe(true);
        expect(verdicts.at(-1)).toMatchObject({ kind: "event", terminal: true });
        expect(verdicts.slice(0, -1).every((v) => v.kind === "event" && !v.terminal)).toBe(true);
        expect(g.ended).toBe(true);
        expect(g.lastSeq).toBe(CAPTURED.at(-1)!.seq);
    });

    it("lets a reused result's nested request_id differ from the stream's", () => {
        const result = resultEvent(2) as EventObject & { result: Record<string, unknown> };
        const reused = { ...result, result: { ...result.result, request_id: "req_other_run" } };
        expect(kinds(feed([accepted(), reused]))).toEqual(["event", "event"]);
    });
});

describe("any break before a terminal is invalid", () => {
    const cases: [string, EventObject[], string][] = [
        [
            "a first event that is not accepted",
            [stageEvent(1, "interpreting", "started", 5)],
            "first_not_accepted",
        ],
        ["accepted with seq 2", [{ ...accepted(), seq: 2 }], "first_not_accepted"],
        ["a second accepted", [accepted(), { ...accepted(), seq: 2 }], "accepted_repeated"],
        ["a seq gap", [accepted(), stageEvent(3, "interpreting", "started", 5)], "seq_gap"],
        ["a repeated seq", [accepted(), heartbeatEvent(2, 10), heartbeatEvent(2, 11)], "seq_gap"],
        [
            "another request_id",
            [accepted(), { ...heartbeatEvent(2, 10), request_id: "req_other" }],
            "request_id_changed",
        ],
        [
            "elapsed going back",
            [accepted(), heartbeatEvent(2, 50), heartbeatEvent(3, 40)],
            "elapsed_regressed",
        ],
        [
            "a stage started twice",
            [
                accepted(),
                stageEvent(2, "interpreting", "started", 5),
                stageEvent(3, "interpreting", "started", 6),
            ],
            "stage_order",
        ],
        [
            "a stage completed that never started",
            [accepted(), stageEvent(2, "reading_facts", "completed", 5)],
            "stage_order",
        ],
        [
            "an earlier stage after a later one",
            [
                accepted(),
                stageEvent(2, "reading_facts", "started", 5),
                stageEvent(3, "reading_facts", "completed", 6),
                stageEvent(4, "interpreting", "started", 7),
            ],
            "stage_order",
        ],
        [
            "a stage started while another is open",
            [
                accepted(),
                stageEvent(2, "interpreting", "started", 5),
                stageEvent(3, "synthesizing", "started", 6),
            ],
            "stage_order",
        ],
        [
            "an error naming another reserved result",
            [accepted(), { ...errorEvent(2), reserved_result_id: "result_other_reserved" }],
            "reserved_mismatch",
        ],
        ["accepted with no thread", [acceptedEvent()], "thread_mismatch"],
        [
            "accepted with another thread",
            [{ ...accepted(), thread_id: "thread_other" }],
            "thread_mismatch",
        ],
        [
            "accepted with another submission",
            [{ ...accepted(), submission_id: "sub_other" }],
            "submission_mismatch",
        ],
    ];
    for (const [name, events, reason] of cases) {
        it(name, () => {
            const verdicts = feed(events);
            expect(verdicts.slice(0, -1).every((v) => v.kind === "event")).toBe(true);
            expect(verdicts.at(-1)).toMatchObject({ kind: "invalid", reason });
        });
    }

    it("a skipped stage is fine", () => {
        const verdicts = feed([
            accepted(),
            stageEvent(2, "interpreting", "started", 5),
            stageEvent(3, "interpreting", "completed", 6),
            stageEvent(4, "synthesizing", "started", 7),
            stageEvent(5, "synthesizing", "completed", 8),
            resultEvent(6),
        ]);
        expect(kinds(verdicts)).toEqual(["event", "event", "event", "event", "event", "event"]);
    });

    it("the SSE event and id fields must name the event's type and seq", () => {
        const g = gate();
        expect(g.accept(frameOf(accepted())).kind).toBe("event");
        const heartbeat = heartbeatEvent(2, 10);
        const frame = frameOf(heartbeat);
        expect(g.accept({ ...frame, event: "stage" })).toMatchObject({ reason: "event_field" });
        expect(gate().accept({ ...frameOf(accepted()), id: "7" })).toMatchObject({
            reason: "id_field",
        });
    });

    it("bad JSON and a schema break are invalid", () => {
        expect(gate().accept({ event: "accepted", id: "1", data: "{" })).toMatchObject({
            reason: "bad_json",
        });
        const broken = { ...accepted(), budget_seconds: "lots" };
        expect(gate().accept(frameOf(broken))).toMatchObject({ reason: "schema" });
    });

    it("a schema-valid result the views cannot read is invalid", () => {
        // The projection view is schema-valid in an event, but not a transcript result.
        const g = gate(() => true);
        expect(g.accept(frameOf(accepted())).kind).toBe("event");
        expect(
            g.accept(frameOf({ ...resultEvent(2), result: { projection: true } } as EventObject)),
        ).toMatchObject({ reason: "result_shape" });
    });
});

describe("after the terminal", () => {
    it("a later event is dropped and named, never passed on", () => {
        const verdicts = feed([accepted(), errorEvent(2), heartbeatEvent(3, 10), resultEvent(4)]);
        expect(kinds(verdicts)).toEqual(["event", "event", "after_terminal", "after_terminal"]);
        expect(verdicts[2]).toMatchObject({ eventType: "heartbeat" });
        expect(verdicts[3]).toMatchObject({ eventType: "result" });
    });

    it("names an unknown type `unknown`, never its wire text", () => {
        const g = gate();
        feed([accepted(), errorEvent(2)], g);
        expect(g.accept({ event: "<script>", id: "3", data: '{"type":"evil<b>"}' })).toEqual({
            kind: "after_terminal",
            eventType: "unknown",
        });
    });
});
