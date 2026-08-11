import { describe, expect, it, vi } from "vitest";

import answerFixture from "../contracts/examples/positive/dev_answer.v1.json";
import conversationFixture from "../contracts/examples/positive/dev_conversation.v1.json";
import conversationSummaryFixture from "../contracts/examples/positive/dev_conversation_summary.v1.json";
import evidenceExpansionFixture from "../contracts/examples/positive/dev_evidence_expansion.v1.json";
import feedbackFixture from "../contracts/examples/positive/dev_feedback.v1.json";
import transcriptFixture from "../contracts/examples/positive/dev_conversation_transcript.v1.json";
import type { DevAnswer, DevMessageRequest, DevStreamEvent } from "../generated";
import {
    DevApiError,
    consumeDevSseStream,
    createDevApiClient,
    initialDevConversationStreamState,
    reduceDevConversationStream,
    type DevApiClient,
    type DevConversationCreateInput,
    type DevRunResumeInput,
} from "../client";

function completedEvents(answer: unknown = answerFixture): DevStreamEvent[] {
    return [
        {
            event: "run.started",
            occurred_at: "2026-07-29T12:00:00Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 0,
        },
        {
            answer: answer as DevStreamEvent["answer"],
            event: "answer.completed",
            occurred_at: "2026-07-29T12:00:01Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 1,
        },
        {
            event: "done",
            occurred_at: "2026-07-29T12:00:02Z",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 2,
            terminal_kind: "answer",
        },
    ];
}

function sse(events: readonly DevStreamEvent[]): Response {
    const body = events
        .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
        .join("");
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

describe("Ask Dev browser client", () => {
    it("strictly consumes a complete answer stream and exposes each event", async () => {
        const onEvent = vi.fn();

        const answer = await consumeDevSseStream(sse(completedEvents()), { onEvent });

        expect(answer.answer_id).toBe("answer_01");
        expect(onEvent).toHaveBeenCalledTimes(3);
    });

    it("rejoins an existing run and consumes only the suffix after its cursor", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sse(completedEvents().slice(1)));
        const client = createDevApiClient({ fetch: fetchMock });
        const onEvent = vi.fn();
        const input: DevRunResumeInput = {
            schema_version: "dev_run_resume_request.v1",
            request_id: "request_resume_01",
            conversation_id: "conversation_01",
            last_sequence: 0,
            scope: conversationFixture.current_scope as DevMessageRequest["scope"],
        };

        await expect(client.resumeRun("run_01", input, { onEvent })).resolves.toMatchObject({
            answer_id: "answer_01",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/dev/runs/run_01/resume",
            expect.objectContaining({ method: "POST", cache: "no-store" }),
        );
        const requestInit = fetchMock.mock.calls[0]?.[1];
        expect(JSON.parse(String(requestInit?.body))).toEqual(input);
        expect(onEvent).toHaveBeenCalledTimes(2);
    });

    it("completes a done-only replay from its previously received answer", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sse(completedEvents().slice(2)));
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(
            client.resumeRun(
                "run_01",
                {
                    schema_version: "dev_run_resume_request.v1",
                    request_id: "request_resume_done_01",
                    conversation_id: "conversation_01",
                    last_sequence: 1,
                    scope: conversationFixture.current_scope as DevMessageRequest["scope"],
                },
                { initialAnswer: answerFixture as unknown as DevAnswer },
            ),
        ).resolves.toMatchObject({ answer_id: "answer_01" });
    });

    it("accepts a nonterminal replay suffix as a still-running run", async () => {
        const progress = {
            event: "progress",
            occurred_at: "2026-07-29T12:00:01Z",
            progress: "checking_evidence",
            run_id: "run_01",
            schema_version: "dev_stream_event.v1",
            sequence: 1,
        } as DevStreamEvent;
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sse([progress]));
        const client = createDevApiClient({ fetch: fetchMock });
        const onEvent = vi.fn();

        await expect(
            client.resumeRun(
                "run_01",
                {
                    schema_version: "dev_run_resume_request.v1",
                    request_id: "request_resume_01",
                    conversation_id: "conversation_01",
                    last_sequence: 0,
                    scope: conversationFixture.current_scope as DevMessageRequest["scope"],
                },
                { onEvent },
            ),
        ).resolves.toBeNull();
        expect(onEvent).toHaveBeenCalledWith(progress);
    });

    it("preserves the retryable resume-unavailable contract", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            Response.json(
                {
                    schema_version: "dev_web_error.v1",
                    code: "resume_unavailable",
                    safe_message: "The live run has no durable event after this cursor.",
                    retryable: true,
                },
                { status: 409 },
            ),
        );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(
            client.resumeRun("run_01", {
                schema_version: "dev_run_resume_request.v1",
                request_id: "request_resume_01",
                conversation_id: "conversation_01",
                last_sequence: 0,
                scope: conversationFixture.current_scope as DevMessageRequest["scope"],
            }),
        ).rejects.toMatchObject({
            status: 409,
            detail: { code: "resume_unavailable", retryable: true },
        });
    });

    it("rejects a schema-valid envelope whose completed answer violates the pinned contract", async () => {
        const invalidAnswer = { ...answerFixture, direct_summary: "" };

        await expect(
            consumeDevSseStream(sse(completedEvents(invalidAnswer))),
        ).rejects.toMatchObject({
            name: "DevApiError",
            detail: { code: "invalid_response" },
        });
    });

    it("rejects sequence gaps and missing terminal completion", async () => {
        const events = completedEvents();
        events[1] = { ...events[1], sequence: 4 };

        await expect(consumeDevSseStream(sse(events))).rejects.toBeInstanceOf(DevApiError);
        await expect(
            consumeDevSseStream(sse(completedEvents().slice(0, 2))),
        ).rejects.toBeInstanceOf(DevApiError);
    });

    it("preserves the safe canonical error from a valid error stream", async () => {
        const events: DevStreamEvent[] = [
            completedEvents()[0],
            {
                error: {
                    code: "source_unavailable",
                    request_id: "request_01",
                    retryable: true,
                    safe_message: "A required source is temporarily unavailable.",
                    schema_version: "dev_error.v1",
                },
                event: "error",
                occurred_at: "2026-07-29T12:00:01Z",
                run_id: "run_01",
                schema_version: "dev_stream_event.v1",
                sequence: 1,
            },
            {
                event: "done",
                occurred_at: "2026-07-29T12:00:02Z",
                run_id: "run_01",
                schema_version: "dev_stream_event.v1",
                sequence: 2,
                terminal_kind: "error",
            },
        ];

        await expect(consumeDevSseStream(sse(events))).rejects.toMatchObject({
            detail: {
                code: "source_unavailable",
                safe_message: "A required source is temporarily unavailable.",
            },
        });
    });

    it("uses only same-origin paths and normalizes web errors", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json(
                    { items: [], next_cursor: null },
                    { headers: { "Cache-Control": "no-store" } },
                ),
            )
            .mockResolvedValueOnce(
                Response.json(
                    {
                        schema_version: "dev_web_error.v1",
                        code: "feature_not_enabled",
                        safe_message: "Ask Dev is not enabled.",
                        retryable: false,
                    },
                    { status: 403 },
                ),
            );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.listConversations({ limit: 25 })).resolves.toEqual({
            items: [],
            next_cursor: null,
        });
        await expect(client.getCapabilities()).rejects.toMatchObject({
            status: 403,
            detail: { code: "feature_not_enabled" },
        });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/dev/conversations?limit=25");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/dev/capabilities");
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("Authorization");
    });

    it("preserves the allowance reset on a non-retryable message admission error", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            Response.json(
                {
                    schema_version: "dev_web_error.v1",
                    code: "cost_limit_reached",
                    safe_message: "The platform cost allowance has been reached.",
                    retryable: false,
                    limit_reset_at: "2026-08-01T00:00:00Z",
                },
                { status: 429 },
            ),
        );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(
            client.streamMessage("conversation_01", {
                schema_version: "dev_message_request.v1",
                client_message_id: "message_01",
                request_id: "request_01",
                conversation_id: "conversation_01",
                question: "What changed?",
                question_class: "investigation",
                scope: conversationFixture.current_scope as DevMessageRequest["scope"],
            }),
        ).rejects.toMatchObject({
            status: 429,
            detail: {
                code: "cost_limit_reached",
                retryable: false,
                limit_reset_at: "2026-08-01T00:00:00Z",
            },
        });
    });

    it("loads a canonical transcript page through the same-origin route", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(transcriptFixture));
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(
            client.getConversationTranscript("conversation_01", {
                cursor: "next/page",
                limit: 100,
            }),
        ).resolves.toEqual(transcriptFixture);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/v1/dev/conversations/conversation_01/transcript?cursor=next%2Fpage&limit=100",
            expect.objectContaining({ cache: "no-store" }),
        );
    });

    it("validates the canonical capability projection before exposing it", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    schema_version: "dev_capabilities.v1",
                    ask_dev: true,
                    can_read: true,
                    readiness: "ready",
                }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    schema_version: "dev_capabilities.v1",
                    ask_dev: "yes",
                    readiness: "ready",
                }),
            );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.getCapabilities()).resolves.toMatchObject({
            ask_dev: true,
            can_read: true,
            readiness: "ready",
        });
        await expect(client.getCapabilities()).rejects.toBeInstanceOf(DevApiError);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/dev/capabilities");
    });

    it("accepts pinned conversation, evidence, and feedback responses", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({ items: [conversationSummaryFixture], next_cursor: null }),
            )
            .mockResolvedValueOnce(Response.json(conversationFixture))
            .mockResolvedValueOnce(Response.json(conversationFixture))
            .mockResolvedValueOnce(Response.json(conversationFixture))
            .mockResolvedValueOnce(Response.json(evidenceExpansionFixture))
            .mockResolvedValueOnce(Response.json(feedbackFixture));
        const client = createDevApiClient({ fetch: fetchMock });
        const createInput = {
            current_scope:
                conversationFixture.current_scope as DevConversationCreateInput["current_scope"],
        };

        await expect(client.listConversations()).resolves.toEqual({
            items: [conversationSummaryFixture],
            next_cursor: null,
        });
        await expect(client.createConversation(createInput)).resolves.toEqual(conversationFixture);
        await expect(client.getConversation("conversation_01")).resolves.toEqual(
            conversationFixture,
        );
        await expect(
            client.renameConversation("conversation_01", { title: "Repository delivery status" }),
        ).resolves.toEqual(conversationFixture);
        await expect(client.expandEvidence("ev_01", "answer_01")).resolves.toEqual(
            evidenceExpansionFixture,
        );
        await expect(
            client.submitFeedback("answer_01", { rating: "helpful", reasons: ["useful"] }),
        ).resolves.toEqual(feedbackFixture);
    });

    it.each([
        ["conversation list", (client: DevApiClient) => client.listConversations()],
        [
            "conversation create",
            (client: DevApiClient) =>
                client.createConversation({
                    current_scope:
                        conversationFixture.current_scope as DevConversationCreateInput["current_scope"],
                }),
        ],
        ["conversation read", (client: DevApiClient) => client.getConversation("conversation_01")],
        [
            "conversation rename",
            (client: DevApiClient) =>
                client.renameConversation("conversation_01", { title: "Renamed" }),
        ],
        [
            "evidence expansion",
            (client: DevApiClient) => client.expandEvidence("ev_01", "answer_01"),
        ],
        [
            "feedback",
            (client: DevApiClient) =>
                client.submitFeedback("answer_01", { rating: "helpful", reasons: ["useful"] }),
        ],
    ] as const)("rejects a successful but uncontracted %s response", async (_name, call) => {
        const client = createDevApiClient({ fetch: vi.fn().mockResolvedValue(Response.json({})) });

        await expect(call(client)).rejects.toMatchObject({
            name: "DevApiError",
            detail: { code: "invalid_response" },
        });
    });

    it("rejects schema-valid response content that belongs to another requested resource", async () => {
        const wrongConversation = { ...conversationFixture, conversation_id: "conversation_other" };
        const wrongEvidence = structuredClone(evidenceExpansionFixture);
        wrongEvidence.evidence.evidence_ref_id = "ev_other";
        const wrongFeedback = { ...feedbackFixture, answer_id: "answer_other" };
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json(wrongConversation))
            .mockResolvedValueOnce(Response.json(wrongConversation))
            .mockResolvedValueOnce(Response.json(wrongEvidence))
            .mockResolvedValueOnce(Response.json(wrongFeedback));
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.getConversation("conversation_01")).rejects.toBeInstanceOf(DevApiError);
        await expect(
            client.renameConversation("conversation_01", { title: "Renamed" }),
        ).rejects.toBeInstanceOf(DevApiError);
        await expect(client.expandEvidence("ev_01", "answer_01")).rejects.toBeInstanceOf(
            DevApiError,
        );
        await expect(
            client.submitFeedback("answer_01", { rating: "helpful", reasons: ["useful"] }),
        ).rejects.toBeInstanceOf(DevApiError);
    });

    it("rejects a schema-valid conversation whose nested scope violates canonical semantics", async () => {
        const invalidConversation = structuredClone(conversationFixture);
        invalidConversation.current_scope.repositories = [];
        const client = createDevApiClient({
            fetch: vi.fn().mockResolvedValue(Response.json(invalidConversation)),
        });

        await expect(
            client.createConversation({
                current_scope:
                    conversationFixture.current_scope as DevConversationCreateInput["current_scope"],
            }),
        ).rejects.toBeInstanceOf(DevApiError);
    });

    it("rejects transcript pages with invalid role payloads or conversation identity", async () => {
        const invalidRole = structuredClone(transcriptFixture);
        invalidRole.items[1]!.question = "A leaked user question";
        const wrongConversation = structuredClone(transcriptFixture);
        wrongConversation.conversation_id = "another_conversation";
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json(invalidRole))
            .mockResolvedValueOnce(Response.json(wrongConversation));
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.getConversationTranscript("conversation_01")).rejects.toBeInstanceOf(
            DevApiError,
        );
        await expect(client.getConversationTranscript("conversation_01")).rejects.toBeInstanceOf(
            DevApiError,
        );
    });

    it("provides one reusable stream reducer for the full page and permanent window", () => {
        const events = completedEvents();
        const running = reduceDevConversationStream(initialDevConversationStreamState, events[0]);
        const completed = reduceDevConversationStream(running, events[1]);

        expect(running).toMatchObject({ phase: "running", runId: "run_01" });
        expect(completed).toMatchObject({ phase: "completed", answer: { answer_id: "answer_01" } });
    });
});
