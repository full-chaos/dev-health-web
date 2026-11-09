import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acrRuntimeErrorCodes } from "../errors";
import { BODY_READ_FAILED_MESSAGE, fetchBoundedJson } from "../http";

const warnings = vi.hoisted(() => [] as unknown[][]);

vi.mock("@/lib/logger", () => {
    const ignore = () => undefined;
    return {
        logger: {
            debug: ignore,
            error: ignore,
            fatal: ignore,
            info: ignore,
            trace: ignore,
            warn: (...args: unknown[]) => {
                warnings.push(args);
            },
        },
    };
});

beforeEach(() => {
    warnings.length = 0;
});

// Real undici (Node's global fetch) against a loopback server: no msw in this file.
const CHUNK = Buffer.alloc(64 * 1_024, 0x20);
const OVER_THE_BOUND = Math.ceil(1_048_576 / CHUNK.byteLength) + 1;

let server: Server | undefined;

afterEach(async () => {
    vi.unstubAllGlobals();
    const running = server;
    server = undefined;
    if (running === undefined) return;
    running.closeAllConnections();
    await new Promise<void>((resolve) => running.close(() => resolve()));
});

async function streamingOps(ends: boolean): Promise<{ url: URL; closed: Promise<void> }> {
    let markClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
        markClosed = resolve;
    });
    server = createServer((_request, response) => {
        response.on("close", markClosed);
        response.writeHead(200, { "Content-Type": "application/json" });
        for (let index = 0; index < OVER_THE_BOUND; index += 1) response.write(CHUNK);
        if (ends) response.end();
    });
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const { port } = listening.address() as AddressInfo;
    return { closed, url: new URL(`http://127.0.0.1:${port}/graphql`) };
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_resolve, reject) =>
            setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms),
        ),
    ]);
}

describe("fetchBoundedJson over real undici: a streamed body past 1 MiB", () => {
    it.each([
        ["never ends", false],
        ["ends", true],
    ] as const)(
        "Given a chunked 200 with no Content-Length that %s, then it answers response_too_large in bounded time",
        { timeout: 10_000 },
        async (_name, ends) => {
            const ops = await streamingOps(ends);
            const started = performance.now();
            await expect(
                within(
                    fetchBoundedJson({
                        headers: {},
                        method: "GET",
                        timeoutMs: 30_000,
                        url: ops.url,
                    }),
                    5_000,
                    "the answer",
                ),
            ).rejects.toMatchObject({
                code: acrRuntimeErrorCodes.responseTooLarge,
                retryable: false,
                status: 503,
            });
            expect(performance.now() - started).toBeLessThan(5_000);
            if (!ends) await within(ops.closed, 5_000, "the cancelled read closing the connection");
        },
    );
});

describe("fetchBoundedJson over real undici: a body that is not UTF-8", () => {
    it("Given a 200 JSON body that is not UTF-8 and no unreadable-body hook, then it is malformed_response, as a non-JSON body is", async () => {
        server = createServer((_request, response) => {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
        });
        const listening = server;
        await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
        const { port } = listening.address() as AddressInfo;
        await expect(
            fetchBoundedJson({
                headers: {},
                method: "GET",
                timeoutMs: 5_000,
                url: new URL(`http://127.0.0.1:${port}/status`),
            }),
        ).rejects.toMatchObject({
            name: "AcrRuntimeError",
            code: acrRuntimeErrorCodes.malformedResponse,
            retryable: false,
            status: 503,
        });
    });
});

async function neverEndingOps(
    headers: Record<string, string>,
): Promise<{ url: URL; closed: Promise<void> }> {
    let markClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
        markClosed = resolve;
    });
    server = createServer((_request, response) => {
        response.on("close", markClosed);
        response.writeHead(200, headers);
        response.write(CHUNK);
    });
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const { port } = listening.address() as AddressInfo;
    return { closed, url: new URL(`http://127.0.0.1:${port}/graphql`) };
}

describe("fetchBoundedJson over real undici: a refusal before the body read releases the connection", () => {
    it.each([
        [
            "a Content-Length past 1 MiB",
            { "Content-Length": String(2 * 1_048_576), "Content-Type": "application/json" },
            acrRuntimeErrorCodes.responseTooLarge,
        ],
        [
            "a content type that is not JSON",
            { "Content-Type": "text/html" },
            acrRuntimeErrorCodes.malformedResponse,
        ],
    ] as const)(
        "Given a 200 with %s whose body never ends, then it refuses and the connection closes",
        { timeout: 10_000 },
        async (_name, headers, code) => {
            const ops = await neverEndingOps(headers);
            await expect(
                within(
                    fetchBoundedJson({
                        headers: {},
                        method: "GET",
                        timeoutMs: 30_000,
                        url: ops.url,
                    }),
                    5_000,
                    "the answer",
                ),
            ).rejects.toMatchObject({ code });
            await within(ops.closed, 5_000, "the refused body closing the connection");
        },
    );
});

describe("fetchBoundedJson: a refusal before the body read cancels the body", () => {
    it.each([
        [
            "a Content-Length past 1 MiB",
            { "Content-Length": "1048577", "Content-Type": "application/json" },
            acrRuntimeErrorCodes.responseTooLarge,
        ],
        [
            "a content type that is not JSON",
            { "Content-Type": "text/html" },
            acrRuntimeErrorCodes.malformedResponse,
        ],
    ] as const)("Given %s, then the response body is cancelled", async (_name, headers, code) => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(16));
            },
            cancel() {
                cancelled = true;
            },
        });
        vi.stubGlobal("fetch", async () => new Response(body, { headers }));
        await expect(
            fetchBoundedJson({
                headers: {},
                method: "GET",
                timeoutMs: 5_000,
                url: new URL("http://ops.example.test/graphql"),
            }),
        ).rejects.toMatchObject({ code });
        expect(cancelled).toBe(true);
    });
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<URL> {
    server = createServer(handler);
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const { port } = listening.address() as AddressInfo;
    return new URL(`http://127.0.0.1:${port}/graphql`);
}

describe("fetchBoundedJson over real undici: a network error during the body read", () => {
    it.each([
        ["right after the headers", 0],
        ["after part of the body", 1],
    ] as const)(
        "Given a 200 whose connection is reset %s, then it is a retryable 503 unavailable, not a raw undici error",
        { timeout: 10_000 },
        async (_name, chunks) => {
            const url = await listen((_request, response) => {
                response.writeHead(200, { "Content-Type": "application/json" });
                for (let index = 0; index < chunks; index += 1) response.write('{"a":');
                setTimeout(() => response.socket?.resetAndDestroy(), 50);
            });
            await expect(
                fetchBoundedJson({ headers: {}, method: "GET", timeoutMs: 5_000, url }),
            ).rejects.toMatchObject({
                name: "AcrRuntimeError",
                code: acrRuntimeErrorCodes.unavailable,
                retryable: true,
                status: 503,
            });
        },
    );

    it("Given a 200 whose body stalls past the read timeout, then it is a retryable 504 timeout", async () => {
        const url = await listen((_request, response) => {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.write('{"a":');
        });
        await expect(
            fetchBoundedJson({ headers: {}, method: "GET", timeoutMs: 300, url }),
        ).rejects.toMatchObject({
            name: "AcrRuntimeError",
            code: acrRuntimeErrorCodes.timeout,
            retryable: true,
            status: 504,
        });
    });

    it("Given a body past 1 MiB, then response_too_large comes out as it is, not re-wrapped as unavailable", async () => {
        const url = await listen((_request, response) => {
            response.writeHead(200, { "Content-Type": "application/json" });
            for (let index = 0; index < OVER_THE_BOUND; index += 1) response.write(CHUNK);
        });
        const error: unknown = await fetchBoundedJson({
            headers: {},
            method: "GET",
            timeoutMs: 5_000,
            url,
        }).catch((caught: unknown) => caught);
        expect(error).toMatchObject({
            code: acrRuntimeErrorCodes.responseTooLarge,
            retryable: false,
        });
        expect((error as Error).cause).toBeUndefined();
    });
});

describe("fetchBoundedJson over real undici: a failed body read writes one WARN line", () => {
    it(
        "Given a 200 whose connection is reset right after the headers, then one WARN names the path, unavailable and 0 bytes",
        { timeout: 10_000 },
        async () => {
            const url = await listen((_request, response) => {
                response.writeHead(200, { "Content-Type": "application/json" });
                setTimeout(() => response.socket?.resetAndDestroy(), 50);
            });
            await expect(
                fetchBoundedJson({
                    headers: { Authorization: "Bearer secret-token" },
                    method: "GET",
                    timeoutMs: 5_000,
                    url,
                }),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.unavailable, status: 503 });
            expect(warnings).toEqual([
                [
                    {
                        module: "acr-http",
                        path: "/graphql",
                        code: acrRuntimeErrorCodes.unavailable,
                        bytesRead: 0,
                    },
                    BODY_READ_FAILED_MESSAGE,
                ],
            ]);
        },
    );

    it(
        "Given a 200 whose connection is reset after part of the body, then one WARN names unavailable and at most the bytes sent",
        { timeout: 10_000 },
        async () => {
            const url = await listen((_request, response) => {
                response.writeHead(200, { "Content-Type": "application/json" });
                response.write('{"a":');
                setTimeout(() => response.socket?.resetAndDestroy(), 50);
            });
            await expect(
                fetchBoundedJson({ headers: {}, method: "GET", timeoutMs: 5_000, url }),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.unavailable, status: 503 });
            expect(warnings).toHaveLength(1);
            const [fields, message] = warnings[0] as [Record<string, unknown>, string];
            expect(message).toBe(BODY_READ_FAILED_MESSAGE);
            expect(Object.keys(fields).sort()).toEqual(["bytesRead", "code", "module", "path"]);
            expect(fields).toMatchObject({
                module: "acr-http",
                path: "/graphql",
                code: acrRuntimeErrorCodes.unavailable,
            });
            expect(fields["bytesRead"]).toBeGreaterThanOrEqual(0);
            expect(fields["bytesRead"]).toBeLessThanOrEqual(5);
        },
    );

    it(
        "Given a 200 whose body stalls past the read timeout, then one WARN names the path, timeout and the 5 bytes read",
        { timeout: 10_000 },
        async () => {
            const url = await listen((_request, response) => {
                response.writeHead(200, { "Content-Type": "application/json" });
                response.write('{"a":');
            });
            await expect(
                fetchBoundedJson({
                    headers: {},
                    method: "GET",
                    timeoutMs: 300,
                    url: new URL("/graphql?token=secret", url),
                }),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.timeout, status: 504 });
            expect(warnings).toEqual([
                [
                    {
                        module: "acr-http",
                        path: "/graphql",
                        code: acrRuntimeErrorCodes.timeout,
                        bytesRead: 5,
                    },
                    BODY_READ_FAILED_MESSAGE,
                ],
            ]);
        },
    );

    it(
        "Given a body past 1 MiB, then response_too_large writes no WARN line",
        { timeout: 10_000 },
        async () => {
            const url = await listen((_request, response) => {
                response.writeHead(200, { "Content-Type": "application/json" });
                for (let index = 0; index < OVER_THE_BOUND; index += 1) response.write(CHUNK);
            });
            await expect(
                fetchBoundedJson({ headers: {}, method: "GET", timeoutMs: 5_000, url }),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.responseTooLarge });
            expect(warnings).toEqual([]);
        },
    );

    it("Given a clean 200 JSON read, then it writes no WARN line", async () => {
        const url = await listen((_request, response) => {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"ok":true}');
        });
        await expect(
            fetchBoundedJson({ headers: {}, method: "GET", timeoutMs: 5_000, url }),
        ).resolves.toMatchObject({ status: 200, value: { ok: true } });
        expect(warnings).toEqual([]);
    });
});
