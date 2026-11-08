import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { acrRuntimeErrorCodes } from "../errors";
import { fetchBoundedJson } from "../http";

// Real undici (Node's global fetch) against a loopback server: no msw in this file.
const CHUNK = Buffer.alloc(64 * 1_024, 0x20);
const OVER_THE_BOUND = Math.ceil(1_048_576 / CHUNK.byteLength) + 1;

let server: Server | undefined;

afterEach(async () => {
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
