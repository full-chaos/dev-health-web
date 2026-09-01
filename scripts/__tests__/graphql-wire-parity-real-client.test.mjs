import { createHash } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { wireForm } from "../graphql-wire-parity.ts";

/**
 * codex review, CHAOS-4696 round 1, P2 ARGUED: `wireForm()`
 * (graphql-wire-parity.ts) hard-codes the exchange transform
 * (`createRequest` -> `formatDocument` -> `stringifyDocument`) instead of
 * testing it THROUGH the actually-configured client
 * (`makeServerClient`'s exchange list in `src/lib/graphql/server.ts`).
 * If a future change removes or reorders `cacheExchange` there, real
 * requests would stop carrying `__typename` while this repo's OWN gate
 * kept computing it anyway and reporting a false MATCH -- exactly the
 * "gate sources both sides from the same place" failure CHAOS-4696's
 * evidence bar warns about, just moved one level down into `wireForm`
 * itself.
 *
 * This test closes that gap: it runs the REAL, unmodified `graphqlFetch`
 * (imported fresh, not mocked) against a real local HTTP listener --
 * the exact mechanism `scripts/capture-graphql-wire-fixture.ts` uses for
 * the one-off evidence capture -- and asserts the captured bytes equal
 * `wireForm()`'s output. Unlike the one-off script, THIS runs on every
 * `pnpm exec vitest run` / CI run, so a `cacheExchange` regression in
 * server.ts fails here immediately instead of only being caught by
 * someone remembering to re-run the manual capture script.
 */

let activeServer;

afterEach(async () => {
    if (activeServer) {
        await new Promise((resolve) => activeServer.close(() => resolve()));
        activeServer = undefined;
    }
});

/** Starts a capture server and returns its base URL plus the captured request once one arrives. */
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
                res.end(
                    JSON.stringify({
                        data: { featureFlags: { flags: [], totalCount: 0, degradedReason: null } },
                    }),
                );
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

describe("wireForm matches the REAL configured client (not just its own hard-coded transform)", () => {
    it("featureFlags: a real graphqlFetch request's bytes equal wireForm()'s output", async () => {
        const { port, captured } = await startCaptureServer();
        const previousBackendUrl = process.env.BACKEND_URL;
        process.env.BACKEND_URL = `http://127.0.0.1:${port}`;

        try {
            // Fresh imports so BACKEND_URL is read at call time, matching
            // how a real Next.js server process would pick it up.
            const { graphqlFetch } = await import("../../src/lib/graphql/server");
            const { FEATURE_FLAG_REGISTRY_QUERY } =
                await import("../../src/lib/feature-flags/queries");

            try {
                await graphqlFetch(
                    FEATURE_FLAG_REGISTRY_QUERY,
                    {
                        orgId: "wire-parity-real-client-test",
                        provider: null,
                        project: null,
                        includeArchived: false,
                        limit: 50,
                    },
                    { orgId: "wire-parity-real-client-test" },
                );
            } catch {
                // graphqlFetch may reject on the degraded/no-data path
                // after the request already left the process -- the
                // capture already happened by then. The assertions below
                // are the real check.
            }

            expect(captured).toHaveLength(1);
            const realQuery = extractQuery(captured[0]);
            expect(realQuery).toBeTruthy();

            const expected = wireForm(FEATURE_FLAG_REGISTRY_QUERY);
            expect(realQuery.trim()).toBe(expected.trim());

            // Independent digest check too -- the exact comparison the CI
            // gate itself performs (sha256Trim), not just string equality.
            const realDigest = createHash("sha256").update(realQuery.trim()).digest("hex");
            const wireFormDigest = createHash("sha256").update(expected.trim()).digest("hex");
            expect(realDigest).toBe(wireFormDigest);
        } finally {
            if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
            else process.env.BACKEND_URL = previousBackendUrl;
        }
    });
});
