import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import {
    TransportFailure,
    type AskDevTransport,
} from "@/components/ask-dev/conversation/transport";

import { createAcrBrowserTransport } from "../browserTransport";

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

    it("an aborted call sends nothing and ends with the abort", async () => {
        const reason = new DOMException("gone", "AbortError");
        const controller = new AbortController();
        controller.abort(reason);
        for (const [name, run] of calls) {
            await expect(run(transport(), controller.signal), name).rejects.toBe(reason);
        }
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
