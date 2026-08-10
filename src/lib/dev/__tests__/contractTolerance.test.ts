/**
 * Forward compatibility with a server ahead of this build's pinned contract.
 *
 * Every object in the pinned Ask Dev contract sets `additionalProperties:
 * false`, and the client used to REJECT any undeclared key — so an additive
 * server change killed the run for a web build pinned to an older commit,
 * despite the manifest declaring "additive-within-v1". The reader saw a failed
 * run instead of an answer.
 *
 * These assert the state the system exists to reach: a payload from a NEWER
 * server still yields an answer, while a genuinely malformed one still fails.
 * The base fixtures are the checked-in canonical examples, so the shapes and
 * values around the additions are the real producer's rather than a hand-shaped
 * guess.
 *
 * The UNDECLARED keys, though, are deliberately names no contract will ever
 * adopt. An earlier revision used `record_locator` and `graph_assisted` because
 * they were the real fields on their way -- and the re-pin that landed
 * `record_locator` promptly made this test's premise false, since the key was
 * no longer unknown. Asserting "this key is undeclared" against a name the
 * contract may declare is a test that expires. The mechanism under test does not
 * care what the key is called, only that it is absent from the schema, so the
 * names below are reserved sentinels that keep the assertion true across every
 * future re-pin.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    observedContractDrift,
    resetContractDrift,
    setContractDriftSink,
    type ContractDriftRecord,
} from "../contractDrift";
import answerFixture from "../contracts/examples/positive/dev_answer.v1.json";
import feedbackFixture from "../contracts/examples/positive/dev_feedback.v1.json";
import graphStateEventFixture from "../contracts/examples/positive/dev_stream_event.v1.graph_state.json";
import answerSchema from "../contracts/schemas/dev_answer.v1.schema.json";
import { DevApiError, consumeDevSseStream, createDevApiClient } from "../client";
import type { DevStreamEvent } from "../generated";
import { validatePinnedJsonSchema } from "../jsonSchemaValidation";

const captured: ContractDriftRecord[] = [];

beforeEach(() => {
    resetContractDrift();
    captured.length = 0;
    setContractDriftSink((record) => captured.push(record));
});

afterEach(() => resetContractDrift());

/** The canonical answer as a server one pin AHEAD of us would send it. */
function futureAnswer(): Record<string, unknown> {
    const answer = structuredClone(answerFixture) as Record<string, unknown>;
    const evidence = answer.evidence as Record<string, unknown>[];
    evidence[0]!.__unpinned_nested_field = "gh:pr/4821";
    answer.__unpinned_top_level_field = { state: "lagging", as_of: "2026-08-10T00:00:00Z" };
    return answer;
}

function streamOf(events: readonly unknown[]): Response {
    const body = events
        .map(
            (event) =>
                `event: ${(event as { event: string }).event}\ndata: ${JSON.stringify(event)}\n\n`,
        )
        .join("");
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

function runWith(answer: unknown, extra: readonly unknown[] = []): readonly unknown[] {
    return [
        {
            event: "run.started",
            occurred_at: "2026-07-29T12:00:00Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 0,
        },
        ...extra,
        {
            answer,
            event: "answer.completed",
            occurred_at: "2026-07-29T12:00:01Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 1 + extra.length,
        },
        {
            event: "done",
            occurred_at: "2026-07-29T12:00:02Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 2 + extra.length,
            terminal_kind: "answer",
        },
    ];
}

describe("unknown properties are ignored for parsing and reported", () => {
    it("an answer carrying fields this pin does not declare still validates", () => {
        expect(validatePinnedJsonSchema(futureAnswer(), answerSchema, () => {})).toBe(true);
    });

    it("reports the undeclared keys, at top level and nested inside a strict def", () => {
        validatePinnedJsonSchema(futureAnswer(), answerSchema, (property) =>
            captured.push({
                kind: "unknown_property",
                schemaVersion: "dev_answer.v1",
                path: property.path,
                name: property.key,
            }),
        );
        const names = captured.map((record) => record.name);
        expect(names).toContain("__unpinned_top_level_field");
        expect(names).toContain("__unpinned_nested_field");
        // The nested one must carry WHERE it was, or a report cannot tell you
        // which object drifted.
        const nested = captured.find((record) => record.name === "__unpinned_nested_field");
        expect(nested?.path).toBe("/evidence/0");
    });

    it("never carries a property VALUE into the report", () => {
        validatePinnedJsonSchema(futureAnswer(), answerSchema, (property) =>
            captured.push({
                kind: "unknown_property",
                schemaVersion: "dev_answer.v1",
                path: property.path,
                name: property.key,
            }),
        );
        // "gh:pr/4821" is the undeclared nested field's value; nothing about it may
        // appear anywhere in what gets reported.
        const serialized = JSON.stringify(captured);
        expect(serialized).not.toContain("gh:pr/4821");
        expect(serialized).not.toContain("lagging");
        expect(captured.length).toBeGreaterThan(0);
    });
});

describe("everything else stays strict", () => {
    it("rejects a payload missing a required field", () => {
        const answer = structuredClone(answerFixture) as Record<string, unknown>;
        delete answer.direct_summary;
        expect(validatePinnedJsonSchema(answer, answerSchema, () => {})).toBe(false);
    });

    it("rejects a declared field of the wrong type", () => {
        const answer = structuredClone(answerFixture) as Record<string, unknown>;
        answer.direct_summary = 42;
        expect(validatePinnedJsonSchema(answer, answerSchema, () => {})).toBe(false);
    });

    it("rejects an unknown value for a declared enum", () => {
        const answer = structuredClone(answerFixture) as Record<string, unknown>;
        answer.status = "definitely_not_a_status";
        expect(validatePinnedJsonSchema(answer, answerSchema, () => {})).toBe(false);
    });
});

describe("a stream from a newer server still delivers its answer", () => {
    // `graph.state` WAS this block's worked example of an event name this pin
    // does not recognise -- and the re-pin that declared it (StreamEventType
    // now lists it, alongside the `graph_assisted` answer object) promptly
    // falsified that premise, the same way `record_locator` did for the
    // property-level forward-compatibility tests above and `wrong_cohort` did
    // for the feedback-reason tests. A name the contract may adopt is a test
    // with a built-in expiry, so this uses a reserved sentinel event name
    // instead: one no `StreamEventType` revision will ever declare, so the
    // assertion stays true across every future re-pin. See the dedicated
    // "a declared graph.state event" block below for coverage of the real,
    // now-known event.
    const unrecognisedEvent = {
        event: "__unpinned_test_event_sentinel",
        occurred_at: "2026-07-29T12:00:00.5Z",
        run_id: "run_01",
        schema_version: "dev_stream_event.v1",
        sequence: 1,
    };

    it("ignores an unrecognised event type, consumes its sequence, and completes", async () => {
        const answer = await consumeDevSseStream(
            streamOf(runWith(futureAnswer(), [unrecognisedEvent])),
        );
        // The whole point: the reader gets the answer.
        expect(answer.answer_id).toBe((answerFixture as { answer_id: string }).answer_id);
        expect(
            observedContractDrift().some(
                (record) => record.name === "__unpinned_test_event_sentinel",
            ),
        ).toBe(true);
    });

    it("still rejects a stream whose FIRST frame is unrecognised", async () => {
        await expect(
            consumeDevSseStream(streamOf([{ ...unrecognisedEvent, sequence: 0 }])),
        ).rejects.toBeInstanceOf(DevApiError);
    });

    it("still rejects an unrecognised event that breaks sequence order", async () => {
        await expect(
            consumeDevSseStream(
                streamOf(runWith(futureAnswer(), [{ ...unrecognisedEvent, sequence: 9 }])),
            ),
        ).rejects.toBeInstanceOf(DevApiError);
    });

    it("still rejects an unrecognised event claiming a different run", async () => {
        await expect(
            consumeDevSseStream(
                streamOf(runWith(futureAnswer(), [{ ...unrecognisedEvent, run_id: "run_99" }])),
            ),
        ).rejects.toBeInstanceOf(DevApiError);
    });
});

describe("a declared graph.state event", () => {
    // `graph.state` is now a KNOWN member of StreamEventType (unlike the
    // sentinel above), so a well-formed one must go through FULL validation
    // -- not the unknown-event tolerance path -- consume its sequence number
    // like any other known event, and let the stream complete normally. Built
    // from the checked-in canonical example, not a hand-shaped payload, so
    // this proves the real producer's shape actually validates, not a guess
    // at one.
    function eventAt(sequence: number) {
        return { ...graphStateEventFixture, run_id: "run_01", sequence };
    }

    it("validates on the known path, consumes its sequence, and completes", async () => {
        const answer = await consumeDevSseStream(streamOf(runWith(futureAnswer(), [eventAt(1)])));
        expect(answer.answer_id).toBe((answerFixture as { answer_id: string }).answer_id);
        // Genuinely known, not merely tolerated: nothing about this event name
        // reaches the drift-reporting sink used for undeclared members.
        expect(observedContractDrift().some((record) => record.name === "graph.state")).toBe(false);
    });

    it("still rejects it if it breaks sequence order, same as any other known event", async () => {
        await expect(
            consumeDevSseStream(streamOf(runWith(futureAnswer(), [eventAt(9)]))),
        ).rejects.toBeInstanceOf(DevApiError);
    });
});

describe("feedback echoed with a reason this pin lacks", () => {
    /** The real client path, so the assertion covers `validateFeedbackSchema`
     * rather than a restatement of the fixture. */
    function clientReturning(payload: unknown) {
        return createDevApiClient({
            fetch: async () =>
                new Response(JSON.stringify(payload), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        });
    }

    it("is accepted by the client, and the unrecognised member is reported", async () => {
        // `wrong_cohort` was this test's example of "a reason this pin lacks"
        // -- and the re-pin that declared it (alongside five siblings) promptly
        // falsified that premise, same as `record_locator` did above. This uses
        // a reserved sentinel instead, so the assertion stays true across every
        // future re-pin.
        const undeclaredReason = "__unpinned_test_reason_sentinel";
        const feedback = structuredClone(feedbackFixture) as Record<string, unknown>;
        feedback.reasons = [undeclaredReason];
        const client = clientReturning(feedback);

        await expect(
            client.submitFeedback(feedback.answer_id as string, {
                rating: "not_helpful",
                reasons: ["incorrect"],
            }),
        ).resolves.toMatchObject({ reasons: [undeclaredReason] });

        expect(
            observedContractDrift().some(
                (record) =>
                    record.kind === "unknown_enum_value" && record.name === undeclaredReason,
            ),
        ).toBe(true);
    });

    it("still rejects feedback that breaks a constraint other than the member list", async () => {
        const feedback = structuredClone(feedbackFixture) as Record<string, unknown>;
        feedback.reasons = [];
        const client = clientReturning(feedback);
        await expect(
            client.submitFeedback(feedback.answer_id as string, {
                rating: "not_helpful",
                reasons: ["incorrect"],
            }),
        ).rejects.toBeInstanceOf(DevApiError);
    });
});

describe("drift reporting is deduplicated", () => {
    it("reports the same drift once even across repeated runs", async () => {
        await consumeDevSseStream(streamOf(runWith(futureAnswer())));
        const afterFirstRun = observedContractDrift().length;
        // The same answer is validated on two surfaces per run (nested in the
        // stream event, and as dev_answer.v1), so more than one record for a
        // given key name is correct -- they carry different schema/path
        // provenance. What must NOT happen is growth on every subsequent run.
        expect(afterFirstRun).toBeGreaterThan(0);

        await consumeDevSseStream(streamOf(runWith(futureAnswer())));
        await consumeDevSseStream(streamOf(runWith(futureAnswer())));
        expect(observedContractDrift().length).toBe(afterFirstRun);
    });
});
