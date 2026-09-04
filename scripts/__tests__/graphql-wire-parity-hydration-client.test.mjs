import { createHash } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { wireForm } from "../graphql-wire-parity.ts";

/**
 * codex review, CHAOS-4696 round 3, P2 EXECUTED: rounds 1 and 2 covered
 * `graphqlFetch` (server.ts's plain server client) and the browser
 * client (`providerClient.ts`), but this repo has a THIRD, independently
 * configured `createClient(...)` call site:
 * `graphqlFetchForHydration` (`src/lib/graphql/server.ts:177`), which
 * serves registered documents too (e.g. `investmentHydration.ts` calls
 * it with `INVESTMENT_BREAKDOWN_QUERY`). Codex executed a controlled
 * mutation removing that pipeline's typename-injecting exchanges and
 * confirmed the resulting query text would digest-miss while every
 * existing test/gate stayed green.
 *
 * Full enumeration done in response (so this does not become a fourth
 * whack-a-mole round): every `createClient(...)` call site in this repo,
 * found via `grep -rn "createClient(" src/`:
 *   1. `server.ts:59` (`makeServerClient`, via `graphqlFetch`)          -> covered: graphql-wire-parity-real-client.test.mjs
 *   2. `server.ts:177` (`graphqlFetchForHydration`)                     -> covered HERE
 *   3. `provider.tsx:59` (via `providerClient.ts`'s `createGraphQLClientOptions`) -> covered: graphql-wire-parity-browser-client.test.mjs
 *   4. `urqlClient.ts:42` (`createUrqlClient`)                          -> DEAD CODE: `grep -rln "createUrqlClient|getUrqlClient" src/` outside
 *      urqlClient.ts itself returns nothing; every fetcher that imports from
 *      `urqlClient.ts` imports the re-exported `graphqlFetch` (case 1), never
 *      `createUrqlClient`/`getUrqlClient`. Not tested here because it serves
 *      no live traffic -- if a caller starts using it, add a fifth test
 *      alongside this enumeration, not a bare "add coverage" finding.
 * This is now every LIVE client construction in the repo; a 5th one
 * appearing is a real "new client added" event, not a gap in this sweep.
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

describe("graphqlFetchForHydration (the third urql client pipeline) matches wireForm() too", () => {
    it("investmentBreakdown: a real hydration-client request's bytes equal wireForm()'s output", async () => {
        const { port, captured } = await startCaptureServer();
        const previousBackendUrl = process.env.BACKEND_URL;
        process.env.BACKEND_URL = `http://127.0.0.1:${port}`;

        try {
            const { graphqlFetchForHydration } = await import("../../src/lib/graphql/server");
            const { INVESTMENT_BREAKDOWN_QUERY } = await import("../../src/lib/graphql/queries");

            try {
                await graphqlFetchForHydration(
                    INVESTMENT_BREAKDOWN_QUERY,
                    {
                        orgId: "wire-parity-hydration-client-test",
                        batch: { useInvestment: true },
                    },
                    { orgId: "wire-parity-hydration-client-test" },
                );
            } catch {
                // The capture server's canned response may not satisfy
                // urql's result shape fully -- irrelevant here, the
                // capture already happened by the time any error surfaces.
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
