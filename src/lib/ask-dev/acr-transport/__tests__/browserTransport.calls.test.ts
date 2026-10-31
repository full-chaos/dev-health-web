import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import {
    TransportFailure,
    type AskDevTransport,
    type InvestigationEvent,
} from "@/components/ask-dev/conversation/transport";

import { createAcrBrowserTransport } from "../browserTransport";
import { acceptedEvent, acrFrame, CAPTURED_EVENTS, heartbeatEvent } from "./eventFixtures";

/**
 * CHAOS-12336 (T14b): the thread, delete, feedback and cancel calls of the browser's ACR transport,
 * against a fake `fetch` with real `Response`s (the T14a fakes). Each status ACR's OpenAPI names for
 * a route (`src/lib/acr/contracts/openapi/acr-v1.json`, at the web pin) is mapped here.
 */

const ISSUER = "https://acr.example.test";
const API = `${ISSUER}/api/v1/context-fabric`;
const CONFIG: AcrBrowserClientConfig = {
    issuer: ISSUER,
    webOrigin: "https://web.example.test",
    clientId: "https://web.example.test/oauth/acr-client.json",
    redirectUri: "https://web.example.test/ask-dev/oauth/callback",
    usesMetadataDocument: true,
};
const TOKEN = "fcacr_test_token_0000000000000000000000000000000";
const THREAD = "thread-12345678";
const SUBMISSION = "sub-12345678";
const RESULT = "res-12345678";
const TS = "2026-01-02T03:04:05Z";

let token: AcrAccessToken;
let fetchMock: ReturnType<typeof vi.fn>;
const signal = new AbortController().signal;

function transport(): AskDevTransport {
    return createAcrBrowserTransport(CONFIG, {
        fetch: fetchMock as unknown as typeof fetch,
        now: () => 1_800_000_000_000,
        token: () => token,
        envelope: streamEnvelopeValidators,
        validators: async () => streamValidators,
    });
}

const jsonResponse = (body: unknown, status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
const empty = (status: number) => new Response(null, { status });

const errorEnvelope = (
    code: string,
    status: number,
    details?: Record<string, unknown>,
): Record<string, unknown> => ({
    schema_version: "error.v1",
    request_id: "req_refused",
    error: {
        code,
        message: "refused",
        http_status: status,
        retryable: true,
        ...(details === undefined ? {} : { details }),
    },
});

const threadBody = {
    schema_version: "context_fabric_thread.v1",
    thread_id: THREAD,
    retention_days: 30,
    turn_count: 1,
    created_at: TS,
    last_turn_at: TS,
    expires_at: "2026-02-01T03:04:05Z",
    earlier_turns_cursor: "Y3Vyc29y_-0",
    turns: [
        {
            submission_id: SUBMISSION,
            state: "done",
            result_id: RESULT,
            question: "Why did cycle time rise?",
            admitted_at: TS,
            updated_at: TS,
        },
    ],
};
const listBody = {
    schema_version: "context_fabric_thread_list.v1",
    threads: [
        {
            thread_id: THREAD,
            retention_days: 0,
            turn_count: 3,
            created_at: TS,
            last_turn_at: TS,
            expires_at: "2026-01-03T03:04:05Z",
        },
    ],
    next_cursor: "bmV4dA",
};
const feedbackBody = {
    schema_version: "context_fabric_result_feedback.v1",
    result_id: RESULT,
    correct: "yes",
    useful: "unset",
    updated_at: TS,
};

/** The request of the n-th fetch. */
function sent(n = 0): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
    return { url, init };
}

/** The rules every call keeps (AC): bearer, resource, client version, no cookie, no token in the URL. */
function expectAcrCall(n: number, method: string, url: string) {
    const { url: actual, init } = sent(n);
    expect(actual).toBe(url);
    expect(actual).not.toContain(TOKEN);
    expect(init).toMatchObject({
        method,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
    });
    expect(init.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        "X-ACR-Resource": ISSUER,
        "X-ACR-Client-Version": "0.1.0",
    });
}

beforeEach(() => {
    token = { kind: "token", token: TOKEN, issuer: ISSUER };
    fetchMock = vi.fn();
    for (const level of Object.values(log)) level.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

type EventObject = Record<string, unknown> & { readonly seq: number; readonly type: string };
/** The captured run's submission: an attach with no cursor replays its `accepted`. */
const RUN = String(acceptedEvent().submission_id);
const CAPTURED = CAPTURED_EVENTS as EventObject[];
const frames = (events: readonly EventObject[]) => events.map(acrFrame).join("");
const sseResponse = (body: BodyInit) =>
    new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });

async function collect(events: AsyncIterable<InvestigationEvent>): Promise<InvestigationEvent[]> {
    const out: InvestigationEvent[] = [];
    for await (const event of events) out.push(event);
    return out;
}

/** A body that stays open: push frames, never close. */
function openBody() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });
    return { stream, push: (text: string) => controller.enqueue(new TextEncoder().encode(text)) };
}

describe("listThreads", () => {
    it("GET /threads with the limit and the cursor, checked and mapped", async () => {
        fetchMock.mockImplementation(async () => jsonResponse(listBody, 200));
        await expect(transport().listThreads({ limit: 20, signal })).resolves.toEqual({
            threads: [
                {
                    threadId: THREAD,
                    turnCount: 3,
                    createdAt: TS,
                    lastTurnAt: TS,
                    expiresAt: "2026-01-03T03:04:05Z",
                    firstQuestion: null,
                },
            ],
            nextCursor: "bmV4dA",
        });
        expectAcrCall(0, "GET", `${API}/threads?limit=20`);
        await transport().listThreads({ limit: 5, cursor: "a b/c", signal });
        expectAcrCall(1, "GET", `${API}/threads?limit=5&cursor=a%20b%2Fc`);
    });

    it("400 (a stale cursor) is a refusal; a body the schema refuses is invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("invalid_request", 400), 400));
        await expect(
            transport().listThreads({ limit: 20, cursor: "old", signal }),
        ).rejects.toMatchObject({ name: "TransportRefusal", status: 400 });
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...listBody, threads: "no" }, 200));
        await expect(transport().listThreads({ limit: 20, signal })).rejects.toEqual(
            new TransportFailure("invalid_upstream"),
        );
    });
});

describe("listThreads: no 404 in its contract (codex r2)", () => {
    it("a 404 with no error.v1 body is a dropped call, not a not_found refusal", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("gateway page", { status: 404, headers: { "Content-Type": "text/html" } }),
        );
        const error = await transport()
            .listThreads({ limit: 20, signal })
            .then(
                () => undefined,
                (thrown: unknown) => thrown,
            );
        expect((error as Error).name).toBe("Error");
        expect((error as Error).message).toMatch(/404 with no error body/u);
    });

    it("the routes whose contract has a 404 keep the not_found refusal for a body-less 404", async () => {
        fetchMock.mockResolvedValueOnce(empty(404));
        await expect(transport().deleteThread({ threadId: THREAD, signal })).rejects.toMatchObject({
            name: "TransportRefusal",
            status: 404,
            error: { error: { code: "not_found" } },
        });
    });
});

describe("readThread", () => {
    it("GET /threads/{id} and ?before, checked and mapped", async () => {
        fetchMock.mockImplementation(async () => jsonResponse(threadBody, 200));
        const view = await transport().readThread({ threadId: THREAD, signal });
        expect(view).toMatchObject({
            threadId: THREAD,
            turnCount: 1,
            earlierTurnsCursor: "Y3Vyc29y_-0",
            turns: [{ submissionId: SUBMISSION, state: "done", resultId: RESULT }],
        });
        expectAcrCall(0, "GET", `${API}/threads/${THREAD}`);
        await transport().readThread({ threadId: "thread/x y", before: "Y3Vy+", signal });
        expectAcrCall(1, "GET", `${API}/threads/thread%2Fx%20y?before=Y3Vy%2B`);
    });

    it("404 is null; 400 is a refusal; a broken body is invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(transport().readThread({ threadId: THREAD, signal })).resolves.toBeNull();
        fetchMock.mockResolvedValueOnce(empty(404));
        await expect(transport().readThread({ threadId: THREAD, signal })).resolves.toBeNull();
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("invalid_request", 400), 400));
        await expect(
            transport().readThread({ threadId: THREAD, before: "x", signal }),
        ).rejects.toMatchObject({ name: "TransportRefusal", status: 400 });
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...threadBody, turns: [{}] }, 200));
        await expect(transport().readThread({ threadId: THREAD, signal })).rejects.toEqual(
            new TransportFailure("invalid_upstream"),
        );
    });
});

describe("deleteThread", () => {
    it("DELETE /threads/{id}: 204 resolves", async () => {
        fetchMock.mockResolvedValue(empty(204));
        await expect(
            transport().deleteThread({ threadId: THREAD, signal }),
        ).resolves.toBeUndefined();
        expectAcrCall(0, "DELETE", `${API}/threads/${THREAD}`);
    });

    it("404 (a malformed id) is a refusal; a 2xx other than 204 is invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(transport().deleteThread({ threadId: "x", signal })).rejects.toMatchObject({
            name: "TransportRefusal",
            status: 404,
        });
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
        await expect(transport().deleteThread({ threadId: THREAD, signal })).rejects.toEqual(
            new TransportFailure("invalid_upstream"),
        );
    });
});

describe("readFeedback and setFeedback", () => {
    it("GET …/feedback/{id}: checked and mapped; 404 is null; a broken body is invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(feedbackBody, 200));
        await expect(transport().readFeedback({ resultId: RESULT, signal })).resolves.toEqual({
            resultId: RESULT,
            correct: "yes",
            useful: "unset",
        });
        expectAcrCall(0, "GET", `${API}/investigations/feedback/${RESULT}`);
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(transport().readFeedback({ resultId: RESULT, signal })).resolves.toBeNull();
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...feedbackBody, correct: "maybe" }, 200));
        await expect(transport().readFeedback({ resultId: RESULT, signal })).rejects.toEqual(
            new TransportFailure("invalid_upstream"),
        );
    });

    it("POST …/feedback/{id} sends the whole request body and maps what ACR stored", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...feedbackBody, useful: "no" }, 200));
        await expect(
            transport().setFeedback({ resultId: RESULT, correct: "yes", useful: "no", signal }),
        ).resolves.toEqual({ resultId: RESULT, correct: "yes", useful: "no" });
        expectAcrCall(0, "POST", `${API}/investigations/feedback/${RESULT}`);
        const { init } = sent(0);
        expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
            schema_version: "context_fabric_result_feedback_request.v1",
            correct: "yes",
            useful: "no",
        });
    });

    it("POST: 404 and 400 are refusals; a broken body is invalid_upstream", async () => {
        const set = () =>
            transport().setFeedback({ resultId: RESULT, correct: "no", useful: "unset", signal });
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(set()).rejects.toMatchObject({ name: "TransportRefusal", status: 404 });
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("invalid_request", 400), 400));
        await expect(set()).rejects.toMatchObject({ name: "TransportRefusal", status: 400 });
        fetchMock.mockResolvedValueOnce(jsonResponse({ schema_version: "nope" }, 200));
        await expect(set()).rejects.toEqual(new TransportFailure("invalid_upstream"));
    });
});

describe("cancel", () => {
    const cancel = () => transport().cancel({ submissionId: SUBMISSION, signal });

    it("POST …/submissions/{id}/cancel with no body: 202 running, 204 final", async () => {
        fetchMock.mockResolvedValueOnce(empty(202));
        await expect(cancel()).resolves.toEqual({ kind: "running" });
        expectAcrCall(0, "POST", `${API}/investigations/submissions/${SUBMISSION}/cancel`);
        expect(sent(0).init.body ?? null).toBeNull();
        fetchMock.mockResolvedValueOnce(empty(204));
        await expect(cancel()).resolves.toEqual({ kind: "final" });
    });

    it("409 submission_in_progress with reason not_leased is not_leased, with Retry-After", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                errorEnvelope("submission_in_progress", 409, { reason: "not_leased" }),
                409,
                { "Retry-After": "7" },
            ),
        );
        await expect(cancel()).resolves.toEqual({ kind: "not_leased", retryAfterSeconds: 7 });
        fetchMock.mockResolvedValueOnce(
            jsonResponse(
                errorEnvelope("submission_in_progress", 409, { reason: "not_leased" }),
                409,
            ),
        );
        await expect(cancel()).resolves.toEqual({
            kind: "not_leased",
            retryAfterSeconds: undefined,
        });
    });

    it("another 409, a 404 and a body-less 409 are refusals", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(errorEnvelope("submission_in_progress", 409, { reason: "other" }), 409),
        );
        await expect(cancel()).rejects.toMatchObject({ name: "TransportRefusal", status: 409 });
        fetchMock.mockResolvedValueOnce(
            jsonResponse(errorEnvelope("submission_mismatch", 409), 409),
        );
        await expect(cancel()).rejects.toMatchObject({ name: "TransportRefusal", status: 409 });
        // The reason alone is not enough: the code must be submission_in_progress.
        fetchMock.mockResolvedValueOnce(
            jsonResponse(errorEnvelope("thread_closed", 409, { reason: "not_leased" }), 409),
        );
        await expect(cancel()).rejects.toMatchObject({ name: "TransportRefusal", status: 409 });
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(cancel()).rejects.toMatchObject({ name: "TransportRefusal", status: 404 });
        fetchMock.mockResolvedValueOnce(empty(409));
        await expect(cancel()).rejects.toThrow(/409/u);
    });

    it("a 200 is not in the contract: invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
        await expect(cancel()).rejects.toEqual(new TransportFailure("invalid_upstream"));
    });
});

describe("attach", () => {
    const attach = (lastEventId?: number, t = transport()) =>
        t.attach({ submissionId: RUN, lastEventId, signal });

    it("GET …/events with exactly Accept: text/event-stream; no cursor replays from accepted", async () => {
        fetchMock.mockResolvedValueOnce(sseResponse(frames(CAPTURED)));
        const events = await collect(attach());
        expect(events.map((event) => event.seq)).toEqual(CAPTURED.map((event) => event.seq));
        expectAcrCall(0, "GET", `${API}/investigations/submissions/${RUN}/events`);
        const { init } = sent(0);
        expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
        expect(init.headers).not.toHaveProperty("Last-Event-ID");
    });

    it("a cursor is sent as Last-Event-ID, and the stream resumes after it", async () => {
        fetchMock.mockResolvedValueOnce(sseResponse(frames(CAPTURED.slice(3))));
        const events = await collect(attach(3));
        expect(events[0]?.seq).toBe(4);
        expect(events.at(-1)?.type).toBe("result");
        expect(sent(0).init.headers).toMatchObject({ "Last-Event-ID": "3" });
    });

    it("a cursor that is not a safe integer of 0 or more sends nothing", async () => {
        for (const bad of [1.5, -1, 2 ** 53, Number.NaN]) {
            await expect(collect(attach(bad)), String(bad)).rejects.toThrow(/Last-Event-ID/u);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("404 and 410 cursor_expired are refusals; a non-SSE answer is invalid_upstream", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("not_found", 404), 404));
        await expect(collect(attach(3))).rejects.toMatchObject({
            name: "TransportRefusal",
            status: 404,
        });
        fetchMock.mockResolvedValueOnce(
            jsonResponse(errorEnvelope("cursor_expired", 410, { reason: "expired" }), 410),
        );
        await expect(collect(attach(3))).rejects.toMatchObject({
            name: "TransportRefusal",
            status: 410,
            error: { error: { code: "cursor_expired" } },
        });
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 200));
        await expect(collect(attach())).rejects.toEqual(new TransportFailure("invalid_upstream"));
    });

    it("a break of the stream after the cursor is invalid_upstream", async () => {
        // The cursor is 3: the next event must be 4.
        fetchMock.mockResolvedValueOnce(sseResponse(frames(CAPTURED.slice(4))));
        await expect(collect(attach(3))).rejects.toEqual(new TransportFailure("invalid_upstream"));
    });

    it("a result the full schema refuses is invalid_upstream (option (c))", async () => {
        fetchMock.mockResolvedValueOnce(sseResponse(frames(CAPTURED)));
        const strict = createAcrBrowserTransport(CONFIG, {
            fetch: fetchMock as unknown as typeof fetch,
            now: () => 1_800_000_000_000,
            token: () => token,
            envelope: streamEnvelopeValidators,
            validators: async () => ({
                ...streamValidators,
                validateInvestigationEvent: () => false,
            }),
        });
        await expect(collect(attach(undefined, strict))).rejects.toEqual(
            new TransportFailure("invalid_upstream"),
        );
    });

    it("no headers in 15 s is admission_timeout; no byte for 30 s is stalled", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementationOnce(
            (_url: string, init: RequestInit) =>
                new Promise((_ok, fail) =>
                    init.signal!.addEventListener("abort", () => fail(init.signal!.reason)),
                ),
        );
        const waiting = collect(attach(3)).then(
            () => "ended",
            (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(15_000);
        expect(await waiting).toEqual(new TransportFailure("admission_timeout"));

        const body = openBody();
        fetchMock.mockResolvedValueOnce(sseResponse(body.stream));
        const stalling = collect(attach(3)).then(
            () => "ended",
            (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(0);
        body.push(frames([heartbeatEvent(4, 40_000)]));
        await vi.advanceTimersByTimeAsync(29_999);
        body.push(": keepalive\n\n");
        await vi.advanceTimersByTimeAsync(29_999);
        let settled = false;
        void stalling.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await stalling).toEqual(new TransportFailure("stalled"));
    });
});

describe("every T14b call", () => {
    const calls: [string, (t: AskDevTransport, s: AbortSignal) => Promise<unknown>][] = [
        ["listThreads", (t, s) => t.listThreads({ limit: 20, signal: s })],
        ["readThread", (t, s) => t.readThread({ threadId: THREAD, signal: s })],
        ["deleteThread", (t, s) => t.deleteThread({ threadId: THREAD, signal: s })],
        ["readFeedback", (t, s) => t.readFeedback({ resultId: RESULT, signal: s })],
        [
            "setFeedback",
            (t, s) => t.setFeedback({ resultId: RESULT, correct: "yes", useful: "yes", signal: s }),
        ],
        ["cancel", (t, s) => t.cancel({ submissionId: SUBMISSION, signal: s })],
        ["attach", (t, s) => collect(t.attach({ submissionId: RUN, lastEventId: 3, signal: s }))],
    ];

    it("no token: authorization_required, and nothing is sent", async () => {
        token = { kind: "authorization_required" };
        for (const [name, run] of calls) {
            await expect(run(transport(), signal), name).rejects.toEqual(
                new TransportFailure("authorization_required"),
            );
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("401: authorization_required, never retried", async () => {
        for (const [name, run] of calls) {
            fetchMock.mockResolvedValueOnce(jsonResponse(errorEnvelope("invalid_token", 401), 401));
            await expect(run(transport(), signal), name).rejects.toEqual(
                new TransportFailure("authorization_required"),
            );
        }
        expect(fetchMock).toHaveBeenCalledTimes(calls.length);
    });

    it("a non-2xx answer with no valid error.v1 body is a dropped call, as in T14a (codex r1)", async () => {
        // Not ACR's refusal (a gateway's page, a broken envelope): neither a TransportRefusal nor
        // invalid_upstream. The store reads it as a dropped call; for these calls that is the same
        // state as any failed read.
        const broken = { schema_version: "error.v1", request_id: "req_bad", error: { code: "x" } };
        for (const [name, run] of calls) {
            fetchMock.mockResolvedValueOnce(jsonResponse(broken, 400));
            const error = await run(transport(), signal).then(
                () => undefined,
                (thrown: unknown) => thrown,
            );
            expect(error, name).toBeInstanceOf(Error);
            expect((error as Error).name, name).toBe("Error");
            expect((error as Error).message, name).toMatch(/400 with no error body/u);
        }
    });

    it("an error.v1 answer ACR may give on any route (503) is a refusal, with Retry-After", async () => {
        for (const [name, run] of calls) {
            fetchMock.mockResolvedValueOnce(
                jsonResponse(errorEnvelope("upstream_unavailable", 503), 503, {
                    "Retry-After": "3",
                }),
            );
            await expect(run(transport(), signal), name).rejects.toMatchObject({
                name: "TransportRefusal",
                status: 503,
                retryAfterSeconds: 3,
            });
        }
    });

    it("an aborted call reads no token, sends nothing and ends with the abort", async () => {
        const reason = new DOMException("gone", "AbortError");
        const controller = new AbortController();
        controller.abort(reason);
        const tokenRead = vi.fn(() => token);
        const unread = createAcrBrowserTransport(CONFIG, {
            fetch: fetchMock as unknown as typeof fetch,
            now: () => 1_800_000_000_000,
            token: tokenRead,
            envelope: streamEnvelopeValidators,
            validators: async () => streamValidators,
        });
        for (const [name, run] of calls) {
            await expect(run(unread, controller.signal), name).rejects.toBe(reason);
        }
        expect(tokenRead).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logs never carry the token", async () => {
        for (const [, run] of calls) {
            fetchMock.mockResolvedValueOnce(
                jsonResponse(errorEnvelope("upstream_unavailable", 503), 503),
            );
            await run(transport(), signal).catch(() => undefined);
        }
        expect(JSON.stringify(Object.values(log).map((level) => level.mock.calls))).not.toContain(
            TOKEN,
        );
    });
});
