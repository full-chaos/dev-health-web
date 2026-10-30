import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import request from "@/lib/ask-dev/__tests__/captures/context_fabric_investigation_request.v1.json";
import {
    STREAM_CAPTURE,
    acceptedEvent,
    acrFrame,
    acrStream,
    errorEvent,
    heartbeatEvent,
    resultEvent,
    stageEvent,
} from "@/lib/ask-dev/__tests__/event-fixtures";
import { MAX_EVENT_BYTES } from "@/lib/ask-dev/sse-frames";
import { POST } from "./route";

/**
 * The event proxy (CHAOS-11925, plan §2.7.7): ACR's stream is parsed incrementally, each event is
 * validated and written again whole, and the browser gets exactly one terminal.
 */

const server = setupServer();
const temporaryPaths: string[] = [];

const OPS = "http://ops.example.test";
const ACR = "https://acr.example.test";
const INVESTIGATIONS = `${ACR}/api/v1/context-fabric/investigations`;
const KEEPALIVE = ": keepalive\n\n";
const encoder = new TextEncoder();

function writeSigningKey(): string {
    const pair = generateKeyPairSync("ed25519");
    const directory = mkdtempSync(join(tmpdir(), "ask-dev-route-key-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    return keyFile;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", writeSigningKey());
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", OPS);
    vi.mocked(auth).mockResolvedValue({
        access_token: "ops-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123" },
    } as Awaited<ReturnType<typeof auth>>);
    server.use(
        http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () =>
            HttpResponse.json({
                features: { agent_context_runtime: true, ask_dev: true },
                is_valid: true,
            }),
        ),
        http.post(`${OPS}/graphql`, () =>
            HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: [
                            {
                                __typename: "CatalogValueItem",
                                count: 1,
                                value: "full-chaos/dev-health",
                            },
                        ],
                    },
                },
            }),
        ),
    );
});
afterEach(() => {
    vi.useRealTimers();
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.mocked(logger.warn).mockClear();
    for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

function post(): Promise<Response> {
    return POST(
        new Request("http://web.example.test/api/ask-dev/investigations", {
            body: JSON.stringify(request),
            headers: { "Content-Type": "application/json", Origin: "http://web.example.test" },
            method: "POST",
        }),
    );
}

type Upstream = {
    aborted: boolean;
    push: (chunk: string | Uint8Array) => void;
    close: () => void;
};

/** An ACR answer whose body the test writes chunk by chunk; it records its abort. */
function upstream(start: (stream: Upstream) => void = () => undefined): Upstream {
    const state: Upstream = { aborted: false, close: () => undefined, push: () => undefined };
    server.use(
        http.post(INVESTIGATIONS, ({ request: incoming }) => {
            incoming.signal.addEventListener("abort", () => {
                state.aborted = true;
            });
            return new HttpResponse(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        state.push = (chunk) => {
                            try {
                                controller.enqueue(
                                    typeof chunk === "string" ? encoder.encode(chunk) : chunk,
                                );
                            } catch {
                                // The reader is gone (web aborted upstream).
                            }
                        };
                        state.close = () => {
                            try {
                                controller.close();
                            } catch {
                                // Already closed or errored.
                            }
                        };
                        start(state);
                    },
                }),
                { headers: { "Content-Type": "text/event-stream" } },
            );
        }),
    );
    return state;
}

/** An ACR answer that writes `text` in chunks of `size` bytes, then closes. */
function upstreamChunked(text: string, size: number): Upstream {
    return upstream((stream) => {
        const bytes = encoder.encode(text);
        for (let offset = 0; offset < bytes.length; offset += size) {
            stream.push(bytes.slice(offset, offset + size));
        }
        stream.close();
    });
}

function webErrors(text: string): Record<string, unknown>[] {
    return [...text.matchAll(/^event: error\ndata: (.+)$/gmu)]
        .map((match) => JSON.parse(match[1]!) as Record<string, unknown>)
        .filter((data) => data.source === "web");
}

function terminals(text: string): string[] {
    return [...text.matchAll(/^event: (result|error)$/gmu)].map((match) => match[1]!);
}

function warnings(): Record<string, unknown>[] {
    return vi
        .mocked(logger.warn)
        .mock.calls.map((call) => call[0] as unknown as Record<string, unknown>);
}

describe("POST /api/ask-dev/investigations — the event proxy", () => {
    it("writes the real ACR capture, read in 7-byte chunks, back as the same frames with no web terminal", async () => {
        const state = upstreamChunked(STREAM_CAPTURE, 7);

        const response = await post();
        const text = await response.text();

        expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
        expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
        expect(response.headers.get("x-accel-buffering")).toBe("no");
        expect(response.headers.get("content-encoding")).toBeNull();
        expect(text.startsWith(KEEPALIVE)).toBe(true);
        // ACR writes compact JSON in its own key order; web's frames match it byte for byte.
        expect(text.replaceAll(KEEPALIVE, "")).toBe(STREAM_CAPTURE);
        expect(terminals(text)).toEqual(["result"]);
        expect(webErrors(text)).toEqual([]);
        expect(state.aborted).toBe(false);
    });

    it("writes CRLF framing and multi-line data again as one-line LF frames, and drops comments and unknown fields", async () => {
        const accepted = JSON.stringify(acceptedEvent());
        const cut = accepted.indexOf(',"seq"') + 1;
        upstreamChunked(
            `: upstream comment\r\nretry: 5\r\nid: 1\r\nevent: accepted\r\ndata: ${accepted.slice(0, cut)}\r\ndata: ${accepted.slice(cut)}\r\n\r\n` +
                acrFrame(resultEvent(2)).replaceAll("\n", "\r"),
            11,
        );

        const text = (await post().then((response) => response.text())).replaceAll(KEEPALIVE, "");

        expect(text).toBe(acrStream(acceptedEvent(), resultEvent(2)));
    });

    it("never writes a keepalive inside an event, even when ACR pauses mid-frame", async () => {
        vi.useFakeTimers();
        const heartbeat = acrFrame(heartbeatEvent(2, 10_000));
        const state = upstream((stream) => {
            stream.push(acrFrame(acceptedEvent()));
            stream.push(heartbeat.slice(0, 20));
        });
        const response = await post();
        const read = response.text();
        // Two keepalive intervals while half of the heartbeat frame waits in the parser.
        await vi.advanceTimersByTimeAsync(21_000);
        state.push(heartbeat.slice(20));
        state.push(acrFrame(resultEvent(3)));
        state.close();
        const text = await read;

        const pieces = text.split("\n\n").filter((piece) => piece !== "");
        expect(pieces.filter((piece) => piece === ": keepalive").length).toBeGreaterThanOrEqual(3);
        for (const piece of pieces) {
            expect(
                piece === ": keepalive" || /^id: \d+\nevent: \w+\ndata: [^\n]+$/u.test(piece),
                piece,
            ).toBe(true);
        }
        expect(text.replaceAll(KEEPALIVE, "")).toBe(
            acrStream(acceptedEvent(), heartbeatEvent(2, 10_000), resultEvent(3)),
        );
    });

    it("ends an event over the cap with `invalid_upstream`, aborts ACR, and writes none of it", async () => {
        const state = upstream((stream) => {
            stream.push(acrFrame(acceptedEvent()));
            stream.push("id: 2\nevent: result\ndata: ");
            const block = new Uint8Array(64 * 1_024).fill(0x78);
            for (let sent = 0; sent <= MAX_EVENT_BYTES; sent += block.length) stream.push(block);
        });

        const response = await post();
        const text = await response.text();

        expect(text.replaceAll(KEEPALIVE, "")).toMatch(
            new RegExp(
                `^${acrFrame(acceptedEvent()).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}event: error\n`,
                "u",
            ),
        );
        expect(text).not.toContain("xxxx");
        expect(webErrors(text)).toEqual([
            expect.objectContaining({
                code: "invalid_upstream",
                phase: "streaming",
                source: "web",
            }),
        ]);
        expect(state.aborted).toBe(true);
        expect(warnings()).toContainEqual(
            expect.objectContaining({
                branch: "invalid_upstream",
                reason: "event_too_large",
                request_id: response.headers.get("x-request-id"),
                reserved_result_id: acceptedEvent().reserved_result_id,
            }),
        );
    });

    it("ends a stream over 8 MiB in total with `invalid_upstream`, even when no event is over its cap", async () => {
        const state = upstream((stream) => {
            stream.push(acrFrame(acceptedEvent()));
            // 60 KiB comment events: each one far under the event cap, 140 of them over 8 MiB.
            const comment = encoder.encode(`: ${"p".repeat(60 * 1_024)}\n\n`);
            for (let sent = 0; sent < 140; sent += 1) stream.push(comment);
        });

        const text = await post().then((response) => response.text());

        expect(webErrors(text)).toEqual([expect.objectContaining({ code: "invalid_upstream" })]);
        expect(state.aborted).toBe(true);
        expect(warnings()).toContainEqual(
            expect.objectContaining({ branch: "invalid_upstream", reason: "stream_too_large" }),
        );
    });

    it.each([
        ["bad JSON", 'id: 2\nevent: heartbeat\ndata: {"seq":2,\n\n', "bad_json"],
        [
            "an event the schema refuses",
            acrFrame({ ...heartbeatEvent(2, 5), note: "planted" }),
            "schema",
        ],
        ["a seq that goes back", acrFrame(heartbeatEvent(1, 5)), "seq_not_increasing"],
        ["a repeated accepted", acrFrame({ ...acceptedEvent(), seq: 2 }), "accepted_repeated"],
        [
            "a frame that is not UTF-8",
            Uint8Array.of(0x64, 0x61, 0x74, 0x61, 0x3a, 0xff, 0x0a),
            "malformed_frame",
        ],
    ])(
        "ends the stream on %s with `invalid_upstream` and aborts ACR",
        async (_name, bad, reason) => {
            const state = upstream((stream) => {
                stream.push(acrFrame(acceptedEvent()));
                stream.push(bad);
                // ACR keeps the stream open: only web's abort can end it.
            });

            const response = await post();
            const text = await response.text();

            expect(text.replaceAll(KEEPALIVE, "").startsWith(acrFrame(acceptedEvent()))).toBe(true);
            expect(text).not.toContain("planted");
            expect(terminals(text)).toEqual(["error"]);
            expect(webErrors(text)).toEqual([
                expect.objectContaining({ code: "invalid_upstream", retryable: false }),
            ]);
            expect(state.aborted).toBe(true);
            expect(warnings()).toContainEqual(
                expect.objectContaining({ branch: "invalid_upstream", reason, last_seq: 1 }),
            );
        },
    );

    it("drops and logs a second terminal: the browser gets exactly one", async () => {
        upstreamChunked(
            acrStream(acceptedEvent(), resultEvent(2), errorEvent(3), resultEvent(4)),
            64,
        );

        const response = await post();
        const text = await response.text();

        expect(text.replaceAll(KEEPALIVE, "")).toBe(acrStream(acceptedEvent(), resultEvent(2)));
        expect(terminals(text)).toEqual(["result"]);
        const duplicates = warnings().filter((w) => w.branch === "duplicate_terminal");
        expect(duplicates).toEqual([
            expect.objectContaining({
                event_type: "error",
                request_id: response.headers.get("x-request-id"),
                terminal: "result",
            }),
            expect.objectContaining({ event_type: "result", terminal: "result" }),
        ]);
    });

    it("forwards ACR's own error terminal and adds no web terminal", async () => {
        upstreamChunked(acrStream(acceptedEvent(), errorEvent(2, "synthesis_rejected")), 50);

        const text = (await post().then((response) => response.text())).replaceAll(KEEPALIVE, "");

        expect(text).toBe(acrStream(acceptedEvent(), errorEvent(2, "synthesis_rejected")));
        expect(webErrors(text)).toEqual([]);
    });

    it("passes a seq gap on and logs it", async () => {
        upstreamChunked(acrStream(acceptedEvent(), heartbeatEvent(4, 9), resultEvent(5)), 64);

        const text = await post().then((response) => response.text());

        expect(terminals(text)).toEqual(["result"]);
        expect(warnings()).toContainEqual(
            expect.objectContaining({ branch: "seq_gap", seq: 4, seq_gap: 2 }),
        );
    });
});

describe("POST /api/ask-dev/investigations — a stream that ends without a terminal", () => {
    it("writes `interrupted` when ACR closes after progress events, and logs the last seq", async () => {
        const state = upstreamChunked(
            acrStream(acceptedEvent(), stageEvent(2, "interpreting", "started", 5)),
            40,
        );

        const response = await post();
        const text = await response.text();

        expect(
            text
                .replaceAll(KEEPALIVE, "")
                .startsWith(
                    acrStream(acceptedEvent(), stageEvent(2, "interpreting", "started", 5)),
                ),
        ).toBe(true);
        expect(terminals(text)).toEqual(["error"]);
        expect(webErrors(text)).toEqual([
            expect.objectContaining({
                code: "interrupted",
                phase: "streaming",
                request_id: response.headers.get("x-request-id"),
                retryable: true,
            }),
        ]);
        expect(state.aborted).toBe(false);
        expect(warnings()).toContainEqual(
            expect.objectContaining({
                branch: "interrupted",
                discarded_partial_event: false,
                events: 2,
                last_seq: 2,
                reason: "eof_without_terminal",
                reserved_result_id: acceptedEvent().reserved_result_id,
            }),
        );
    });

    it("treats a terminal frame cut off before its blank line as no terminal", async () => {
        upstreamChunked(acrFrame(acceptedEvent()) + acrFrame(resultEvent(2)).slice(0, -1), 500);

        const text = await post().then((response) => response.text());

        expect(text).not.toContain("event: result");
        expect(webErrors(text)).toEqual([expect.objectContaining({ code: "interrupted" })]);
        expect(warnings()).toContainEqual(
            expect.objectContaining({ branch: "interrupted", discarded_partial_event: true }),
        );
    });

    it("writes `interrupted` for an empty event stream", async () => {
        upstreamChunked("", 1);

        const text = await post().then((response) => response.text());

        expect(webErrors(text)).toEqual([expect.objectContaining({ code: "interrupted" })]);
        expect(warnings()).toContainEqual(
            expect.objectContaining({ branch: "interrupted", events: 0, last_seq: 0 }),
        );
    });
});

describe("POST /api/ask-dev/investigations — after the terminal", () => {
    it("writes nothing more, keepalives included, when ACR stalls after its terminal", async () => {
        vi.useFakeTimers();
        const state = upstream((stream) => {
            stream.push(acrStream(acceptedEvent(), resultEvent(2)));
        });
        const response = await post();
        const read = response.text();
        await vi.advanceTimersByTimeAsync(30_000);
        const text = await read;

        // One keepalive (byte 0) and ACR's two events: nothing after the result.
        expect(text).toBe(KEEPALIVE + acrStream(acceptedEvent(), resultEvent(2)));
        expect(state.aborted).toBe(true);
        expect(warnings()).toContainEqual(
            expect.objectContaining({ after_terminal: true, code: "stalled" }),
        );
    });
});
