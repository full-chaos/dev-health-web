#!/usr/bin/env -S pnpm exec tsx
/**
 * capture-graphql-wire-fixture — CHAOS-4696 hard requirement 1.
 *
 * Captures a REAL request body, off an actual HTTP socket, produced by
 * this repo's UNMODIFIED production `graphqlFetch` code path
 * (src/lib/graphql/server.ts) -- not urql invoked standalone in this
 * script, not a hand-computed reprint. This script only:
 *   1. Starts a tiny local HTTP server that records the raw bytes of
 *      whatever POST body arrives (before any JSON parsing) and returns
 *      a schema-shaped response so graphqlFetch's own success path runs.
 *   2. Points `resolveOrigin()` (src/lib/origin.ts) at that server via
 *      `BACKEND_URL`, the SAME env var production uses.
 *   3. Imports and calls the real, unmodified `graphqlFetch` from
 *      src/lib/graphql/server.ts with the selected production query export
 *      export -- so createClient, the real exchange chain
 *      (timingExchange, errorExchange, cacheExchange, fetchExchange), and
 *      the real global `fetch()` all run exactly as they would inside a
 *      Next.js server process.
 *   4. Writes the captured bytes to
 *      ../ops-worktrees/lane-4696/cmd/query-api/testdata/wire_capture/
 *      (or wherever --out-dir points), plus a README documenting
 *      provenance and both digests (source-copy digest vs captured-wire
 *      digest) so a reader never has to trust this script's own claim.
 *
 * Usage: tsx scripts/capture-graphql-wire-fixture.ts --out-dir <path> [--operation featureFlags|home]
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

// --out-dir is REQUIRED (codex review, CHAOS-4696 round 1, P3 EXECUTED):
// a guessed default silently wrote a captured fixture into a newly
// created, unrelated directory when a sibling `../../ops` checkout
// didn't happen to exist at that exact relative path -- the script still
// reported success, just not into the intended ops checkout. Fail loudly
// instead of guessing.
const outDirArg = process.argv.indexOf("--out-dir");
if (outDirArg === -1 || !process.argv[outDirArg + 1]) {
    process.stderr.write(
        "capture-graphql-wire-fixture: --out-dir is required (e.g. --out-dir <ops-checkout>/cmd/query-api/testdata/wire_capture)\n",
    );
    process.exit(2);
}
const outDir = path.resolve(process.argv[outDirArg + 1]);
const operationArg = process.argv.indexOf("--operation");
const operation = operationArg === -1 ? "featureFlags" : process.argv[operationArg + 1];
if (operation !== "featureFlags" && operation !== "home") {
    throw new Error("capture-graphql-wire-fixture: --operation must be featureFlags or home");
}

interface Captured {
    method: string;
    url: string;
    rawBody: string;
    headers: http.IncomingHttpHeaders;
}

function startCaptureServer(): Promise<{
    server: http.Server;
    port: number;
    captured: Captured[];
}> {
    const captured: Captured[] = [];
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => {
                const rawBody = Buffer.concat(chunks).toString("utf8");
                captured.push({
                    method: req.method ?? "",
                    url: req.url ?? "",
                    rawBody,
                    headers: req.headers,
                });
                res.writeHead(200, { "content-type": "application/json" });
                // Schema-shaped success response so graphqlFetch's own
                // result.data / result.error handling exercises its
                // normal success path (see FeatureFlagsResult in
                // src/lib/feature-flags/queries.ts's consumers).
                res.end(
                    JSON.stringify({
                        data: {
                            featureFlags: {
                                flags: [],
                                totalCount: 0,
                                degradedReason: null,
                            },
                        },
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
            resolve({ server, port: address.port, captured });
        });
    });
}

async function main() {
    const { server, port, captured } = await startCaptureServer();
    process.env.BACKEND_URL = `http://127.0.0.1:${port}`;
    // graphqlFetch's server.ts imports `resolveOrigin` from `@/lib/origin`,
    // which reads `getServerEnv().BACKEND_URL` -- setting it BEFORE the
    // dynamic import below is what routes the real client at our capture
    // server instead of the repo's normal backend default.

    const { graphqlFetch } = await import("../src/lib/graphql/server");
    const { FEATURE_FLAG_REGISTRY_QUERY } = await import("../src/lib/feature-flags/queries");
    const { HOME_QUERY } = await import("../src/lib/graphql/queries");
    const capture =
        operation === "home"
            ? {
                  document: HOME_QUERY,
                  variables: { orgId: "capture-fixture-org", filters: null, window: null },
                  name: "home",
              }
            : {
                  document: FEATURE_FLAG_REGISTRY_QUERY,
                  variables: {
                      orgId: "capture-fixture-org",
                      provider: null,
                      project: null,
                      includeArchived: false,
                      limit: 50,
                  },
                  name: "featureFlags",
              };

    try {
        await graphqlFetch(capture.document, capture.variables, { orgId: "capture-fixture-org" });
    } catch (err) {
        // graphqlFetch may throw on unauthenticated/degraded paths after
        // the request already left the process -- the capture already
        // happened by the time any such error surfaces. Log and continue;
        // fail below only if nothing was captured at all.
        process.stderr.write(
            `graphqlFetch call did not resolve cleanly (expected in a standalone capture): ${err}\n`,
        );
    }

    server.close();

    if (captured.length === 0) {
        throw new Error(
            "capture-graphql-wire-fixture: no request reached the capture server -- graphqlFetch did not send anything",
        );
    }
    if (captured.length > 1) {
        throw new Error(
            `capture-graphql-wire-fixture: expected exactly one captured request, got ${captured.length}`,
        );
    }

    if (process.env.CAPTURE_DEBUG) {
        process.stderr.write(`DEBUG captured entries: ${JSON.stringify(captured, null, 2)}\n`);
    }
    const { method, url, rawBody } = captured[0];

    // urql's default client (createClient's `preferGetMethod:
    // 'within-url-limit'`, unset by this repo's makeServerClient/
    // makeClient) sends a GET with the query in a URL search param
    // instead of a POST JSON body whenever the fully-encoded URL fits in
    // 2047 characters -- true for featureFlags's short variable set. The
    // WIRE FORM TEXT is identical either way (both paths build it via the
    // same `stringifyDocument(request.query)` call — see
    // @urql/core/dist/urql-core-chunk.js's makeFetchURL/makeFetchBody);
    // only the transport encoding differs. Handle both so the captured
    // fixture reflects whichever transport this repo's real client
    // actually used, not an assumption.
    let capturedQuery: string | undefined;
    if (method === "GET") {
        const parsedUrl = new URL(url, "http://127.0.0.1");
        capturedQuery = parsedUrl.searchParams.get("query") ?? undefined;
    } else {
        const parsedBody = JSON.parse(rawBody) as {
            query?: string;
            operationName?: string;
            variables?: unknown;
        };
        capturedQuery = parsedBody.query;
    }
    if (!capturedQuery) {
        throw new Error(
            `capture-graphql-wire-fixture: captured ${method} request has no \`query\` (url=${url}, rawBody=${JSON.stringify(rawBody)})`,
        );
    }
    const capturedDigest = createHash("sha256").update(capturedQuery.trim()).digest("hex");
    const sourceCopyDigest = createHash("sha256").update(capture.document.trim()).digest("hex");

    fs.mkdirSync(outDir, { recursive: true });
    const fixturePath = path.join(outDir, `${capture.name}_captured.graphql`);
    fs.writeFileSync(fixturePath, capturedQuery, "utf8");

    const readmePath = path.join(outDir, "README.md");
    const readme = `# ${capture.name} wire-capture fixture (CHAOS-4696)

\`${capture.name}_captured.graphql\` is the RAW \`query\` text captured off a
real HTTP request, produced by this repo's own UNMODIFIED \`graphqlFetch\`
(\`src/lib/graphql/server.ts\`) calling the real \`@urql/core\` client's
exchange chain (\`createClient\` -> \`timingExchange\` -> \`errorExchange\`
-> \`cacheExchange\` -> \`fetchExchange\`) against a real local HTTP
listener, with the real \`${capture.name}\` operation export as input variables. Nothing in this
capture path calls \`createRequest\`/\`stringifyDocument\` directly, and
nothing hand-reprints the query -- the bytes below are what a real
\`fetch()\` call actually put on the wire.

**Transport observed: \`${method}\`.** This repo's client never sets
\`preferGetMethod\`, so \`createClient\`'s default (\`'within-url-limit'\`)
applies. The WIRE FORM TEXT is byte-identical either way (both transports build it via the
same \`stringifyDocument(request.query)\` call inside \`@urql/core\` --
see \`makeFetchURL\`/\`makeFetchBody\` in
\`@urql/core/dist/urql-core-chunk.js\`); only the encoding differs, and
this script extracts the \`query\` value from whichever transport the real
client actually used.

Capture mechanism: \`scripts/capture-graphql-wire-fixture.ts\`. Re-run it
to refresh this fixture (e.g. after an intentional query text change).

## Digests

| digest of | value |
| --- | --- |
| \`${capture.name}\` source text, unprinted | \`${sourceCopyDigest}\` |
| this captured fixture (real wire bytes) | \`${capturedDigest}\` |

\`cmd/query-api/query_route.go\`'s registered \`${capture.name}\` document
must digest to \`${capturedDigest}\`, not \`${sourceCopyDigest}\`, for
query-api to accept a real client's request.

Captured: ${new Date().toISOString()}, ops tip at capture time: see the
lane's PR description for the exact SHA this was verified against.
`;
    fs.writeFileSync(readmePath, readme, "utf8");

    process.stdout.write(
        `Captured fixture written to ${fixturePath}\n` +
            `  source-copy digest: ${sourceCopyDigest}\n` +
            `  captured-wire digest: ${capturedDigest}\n`,
    );
}

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : err}\n`);
    process.exitCode = 1;
});
