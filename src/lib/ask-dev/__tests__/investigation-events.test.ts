import { describe, expect, it } from "vitest";

import commonSchema from "@/lib/acr/contracts/schemas/context_fabric_common.v1.schema.json";
import { InvestigationEventGate, type EventVerdict } from "../investigation-events";
import { ACR_MAX_SERIALIZED_BYTES, MAX_EVENT_BYTES } from "../sse-frames";
import { SseParser, type SseEvent } from "../sse-parser";
import {
    CAPTURED_EVENTS,
    STREAM_CAPTURE,
    acceptedEvent,
    acrFrame,
    errorEvent,
    heartbeatEvent,
    resultEvent,
    stageEvent,
} from "./event-fixtures";

const encoder = new TextEncoder();

function sse(text: string): SseEvent[] {
    const parser = new SseParser(MAX_EVENT_BYTES);
    const events = parser.push(encoder.encode(text));
    expect(parser.end().discardedPartialEvent).toBe(false);
    return events;
}

function run(text: string): { gate: InvestigationEventGate; verdicts: EventVerdict[] } {
    const gate = new InvestigationEventGate();
    return { gate, verdicts: sse(text).map((event) => gate.accept(event)) };
}

function only<K extends EventVerdict["kind"]>(
    verdict: EventVerdict | undefined,
    kind: K,
): Extract<EventVerdict, { kind: K }> {
    expect(verdict?.kind, JSON.stringify(verdict)).toBe(kind);
    return verdict as Extract<EventVerdict, { kind: K }>;
}

describe("InvestigationEventGate on the real ACR capture", () => {
    it("forwards every event, the result as the one terminal, and writes each again from its parsed value", () => {
        const { gate, verdicts } = run(STREAM_CAPTURE);

        const forwarded = verdicts.map((verdict) => only(verdict, "forward"));
        expect(forwarded.map((v) => v.terminal)).toEqual(
            CAPTURED_EVENTS.map((_, index) => index === CAPTURED_EVENTS.length - 1),
        );
        expect(forwarded.every((v) => v.seqGap === 0)).toBe(true);
        expect(gate.terminal).toBe("result");
        expect(gate.written).toBe(CAPTURED_EVENTS.length);
        expect(gate.reservedResultId).toBe(CAPTURED_EVENTS[0]!.reserved_result_id);
        // The written frames read back to the same events, one data line each.
        const written = forwarded.map((v) => v.frame).join("");
        expect(sse(written).map((event) => JSON.parse(event.data) as unknown)).toEqual(
            CAPTURED_EVENTS,
        );
        for (const verdict of forwarded) {
            expect(verdict.frame.match(/^data: /gmu)).toHaveLength(1);
            expect(verdict.frame).toBe(
                `id: ${verdict.event.seq}\nevent: ${verdict.event.type}\ndata: ${JSON.stringify(verdict.event)}\n\n`,
            );
        }
    });

    it("forwards an error terminal that carries error.v1", () => {
        const { verdicts } = run(acrFrame(acceptedEvent()) + acrFrame(errorEvent(2)));

        expect(only(verdicts[1], "forward")).toMatchObject({ terminal: true });
    });

    it("accepts an event whose JSON spans several data lines, and writes it on one", () => {
        const json = JSON.stringify(acceptedEvent());
        const cut = json.indexOf(',"seq"') + 1;
        const { verdicts } = run(
            `id: 1\nevent: accepted\ndata: ${json.slice(0, cut)}\ndata: ${json.slice(cut)}\n\n`,
        );

        const verdict = only(verdicts[0], "forward");
        expect(verdict.frame).toBe(acrFrame(acceptedEvent()));
    });
});

describe("InvestigationEventGate refusals", () => {
    const accepted = acrFrame(acceptedEvent());

    it("refuses data that is not JSON", () => {
        const { verdicts } = run(`${accepted}id: 2\nevent: heartbeat\ndata: {"seq":2,\n\n`);

        expect(verdicts[1]).toEqual({ kind: "invalid", reason: "bad_json" });
    });

    it.each([
        ["an unknown stage", stageEvent(2, "guessing", "started", 5)],
        ["a heartbeat with a result", { ...heartbeatEvent(2, 5), result: {} }],
        ["a field outside the schema", { ...heartbeatEvent(2, 5), note: "x" }],
        ["a result that fails the response schema", { ...resultEvent(2), result: { a: 1 } }],
        [
            "an error without its reserved result id",
            { ...errorEvent(2), reserved_result_id: undefined },
        ],
    ])("refuses %s by the pinned event schema, naming paths only", (_name, event) => {
        const { verdicts } = run(accepted + acrFrame(event as ReturnType<typeof acceptedEvent>));

        const verdict = only(verdicts[1], "invalid");
        expect(verdict.reason).toBe("schema");
        expect(verdict.errors?.length).toBeGreaterThan(0);
        expect(verdict.errors!.length).toBeLessThanOrEqual(5);
        expect(JSON.stringify(verdict.errors)).not.toContain("guessing");
    });

    it("refuses an SSE event field that is not the event's type, and an id that is not its seq", () => {
        const heartbeat = heartbeatEvent(2, 5);
        const data = JSON.stringify(heartbeat);

        expect(run(`${accepted}id: 2\nevent: stage\ndata: ${data}\n\n`).verdicts[1]).toMatchObject({
            reason: "event_field",
        });
        expect(run(`${accepted}event: heartbeat\ndata: ${data}\n\n`).verdicts[1]).toMatchObject({
            reason: "id_field",
        });
        expect(
            run(`${accepted}id: 3\nevent: heartbeat\ndata: ${data}\n\n`).verdicts[1],
        ).toMatchObject({ reason: "id_field" });
    });

    it("refuses a seq that does not increase, and passes a gap on with its size", () => {
        expect(run(accepted + acrFrame(heartbeatEvent(1, 5))).verdicts[1]).toMatchObject({
            reason: "seq_not_increasing",
            seq: 1,
        });
        const regress = run(
            accepted + acrFrame(heartbeatEvent(3, 5)) + acrFrame(heartbeatEvent(2, 6)),
        );
        expect(regress.verdicts[2]).toMatchObject({ reason: "seq_not_increasing", seq: 2 });
        const gap = run(accepted + acrFrame(heartbeatEvent(5, 5)));
        expect(only(gap.verdicts[1], "forward").seqGap).toBe(3);
    });

    it("refuses a stream that does not start with accepted, or repeats it", () => {
        expect(run(acrFrame(heartbeatEvent(1, 5))).verdicts[0]).toMatchObject({
            reason: "first_not_accepted",
        });
        expect(run(accepted + acrFrame({ ...acceptedEvent(), seq: 2 })).verdicts[1]).toMatchObject({
            reason: "accepted_repeated",
        });
    });
});

describe("InvestigationEventGate after the terminal", () => {
    it("drops a second terminal and names it, and drops any later event", () => {
        const { gate, verdicts } = run(
            acrFrame(acceptedEvent()) +
                acrFrame(resultEvent(2)) +
                acrFrame(errorEvent(3)) +
                acrFrame(resultEvent(4)) +
                acrFrame(heartbeatEvent(5, 9)) +
                "event: mystery\ndata: not json\n\n",
        );

        expect(only(verdicts[1], "forward").terminal).toBe(true);
        expect(verdicts.slice(2)).toEqual([
            { duplicateTerminal: true, eventType: "error", kind: "after_terminal" },
            { duplicateTerminal: true, eventType: "result", kind: "after_terminal" },
            { duplicateTerminal: false, eventType: "heartbeat", kind: "after_terminal" },
            { duplicateTerminal: false, eventType: "unknown", kind: "after_terminal" },
        ]);
        expect(gate.terminal).toBe("result");
        expect(gate.lastSeq).toBe(2);
    });
});

describe("event size cap", () => {
    it("is the pinned InvestigationOptions max_serialized_bytes maximum plus 64 KiB", () => {
        const options = (
            commonSchema as {
                $defs: {
                    InvestigationOptions: { properties: Record<string, { maximum?: number }> };
                };
            }
        ).$defs.InvestigationOptions.properties.max_serialized_bytes;

        expect(ACR_MAX_SERIALIZED_BYTES).toBe(options?.maximum);
        expect(MAX_EVENT_BYTES).toBe(options!.maximum! + 64 * 1_024);
    });
});
