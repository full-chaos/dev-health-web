import { createHash } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import { createClient, ssrExchange } from "@urql/core";
import { afterEach, describe, expect, it } from "vitest";

import { wireForm } from "../graphql-wire-parity.ts";

/**
 * codex review, CHAOS-4696 round 2, P2 ARGUED: the round-1 real-client
 * test (graphql-wire-parity-real-client.test.mjs) only exercises the
 * SERVER client's exchange chain (`src/lib/graphql/server.ts`'s
 * `makeServerClient`). This repo has a SECOND, separately configured
 * urql client for the browser -- `src/lib/graphql/providerClient.ts`'s
 * `createGraphQLClientOptions`, wired up in `provider.tsx`'s
 * `GraphQLProvider` -- and registered documents like
 * `INVESTMENT_BREAKDOWN_QUERY` are genuinely queried from THAT client
 * (`useInvestment.ts`'s `useQuery`), not only from `graphqlFetch`. If a
 * future change removed or reordered `cacheExchange` in
 * `providerClient.ts` specifically (leaving `server.ts` untouched), a
 * real browser request would stop carrying `__typename` while
 * `wireForm()` -- and the round-1 test, which never touches
 * `providerClient.ts` -- would keep reporting a false MATCH.
 *
 * This test closes that gap for the browser client the same way the
 * round-1 test closes it for the server client: build a REAL client from
 * `createGraphQLClientOptions` (the exact options `GraphQLProvider`
 * passes to `createClient`), query it against a real local HTTP
 * listener, and assert the captured bytes equal `wireForm()`'s output.
 */

let activeServer;

afterEach(async () => {
    if (activeServer) {
        await new Promise((resolve) => activeServer.close(() => resolve()));
        activeServer = undefined;
    }
});

function startCaptureServer() {
    return new Promise((resolve, reject) => {
        const captured = [];
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => {
                captured.push({
                    method: req.method ?? "",
                    url: req.url ?? "",
                    rawBody: Buffer.concat(chunks).toString("utf8"),
                });
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ data: { analytics: { breakdowns: [] } } }));
            });
        });
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                reject(new Error("failed to bind capture server"));
                return;
            }
            activeServer = server;
            resolve({ port: address.port, captured });
        });
    });
}

function extractQuery({ method, url, rawBody }) {
    if (method === "GET") {
        return new URL(url, "http://127.0.0.1").searchParams.get("query") ?? undefined;
    }
    return JSON.parse(rawBody).query;
}

describe("providerClient (browser urql client) matches wireForm() too, not just the server client", () => {
    it("investmentBreakdown: a real browser-client query's bytes equal wireForm()'s output", async () => {
        const { port, captured } = await startCaptureServer();
        const previousBackendUrl = process.env.BACKEND_URL;
        process.env.BACKEND_URL = `http://127.0.0.1:${port}`;

        try {
            // Fresh import so BACKEND_URL is read at call time -- same
            // discipline as the round-1 server-client test.
            const { createGraphQLClientOptions } =
                await import("../../src/lib/graphql/providerClient");
            const { INVESTMENT_BREAKDOWN_QUERY } = await import("../../src/lib/graphql/queries");

            // The REAL options GraphQLProvider passes to createClient
            // (provider.tsx) -- not a hand-rolled exchange list.
            const options = createGraphQLClientOptions({
                orgId: "wire-parity-browser-client-test",
                ssr: ssrExchange({ isClient: false }),
            });
            const client = createClient(options);

            try {
                // The capture server's canned response may not satisfy
                // urql's result shape fully -- irrelevant here, the
                // capture already happened by the time any error surfaces.
                await client
                    .query(INVESTMENT_BREAKDOWN_QUERY, {
                        orgId: "wire-parity-browser-client-test",
                        batch: { useInvestment: true },
                    })
                    .toPromise();
            } catch {
                // See comment above.
            }

            expect(captured).toHaveLength(1);
            const realQuery = extractQuery(captured[0]);
            expect(realQuery).toBeTruthy();

            const expected = wireForm(INVESTMENT_BREAKDOWN_QUERY);
            expect(realQuery.trim()).toBe(expected.trim());

            const realDigest = createHash("sha256").update(realQuery.trim()).digest("hex");
            const wireFormDigest = createHash("sha256").update(expected.trim()).digest("hex");
            expect(realDigest).toBe(wireFormDigest);
        } finally {
            if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
            else process.env.BACKEND_URL = previousBackendUrl;
        }
    });
});
