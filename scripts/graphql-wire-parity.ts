#!/usr/bin/env -S pnpm exec tsx
/**
 * graphql-wire-parity — CHAOS-4696 cross-repo CI gate.
 *
 * query-api (ops repo) resolves a request to a registered operation by
 * sha256(strings.TrimSpace(<raw request query text>)) — see
 * cmd/query-api/query_route.go's operationForDocument. But a real browser
 * never sends the query-api registered*Document const's own text: it
 * sends whatever urql's `client.query(...)` puts on the wire, which is
 * graphql-js-family `print()` output (via @0no-co/graphql.web, the
 * package @urql/core actually calls — see stringifyDocument in
 * @urql/core's own source), not the source string. print() reflows an
 * argument list once it exceeds 80 characters, so a registered*Document
 * const that is merely a copy of the web source text can digest-miss a
 * real request the instant an operation's argument list crosses that
 * line — CHAOS-4696's `featureFlags` defect. This script is the parity
 * gate that makes that class of bug structurally impossible to reland
 * silently: it fails whenever a Go const's digest stops matching what
 * THIS repo's own pinned urql actually prints for the matching web query
 * source.
 *
 * Independence, stated explicitly (per CHAOS-4696's evidence bar —
 * "ask what your gate cannot see"):
 *   - Side A (the Go const's digest) is read via `registrydump`, which
 *     parses cmd/query-api/query_route.go's SOURCE with go/ast — it
 *     never touches urql, graphql, or this script.
 *   - Side B (the wire digest) is computed by importing the web
 *     repo's OWN, LIVE query source modules (never a copy pasted into
 *     this file) and pushing them through THIS repo's actually-pinned
 *     `@urql/core` (`createRequest` + `stringifyDocument` — the exact
 *     functions urql's fetchExchange calls in production, not a
 *     hand-rolled reimplementation of graphql-js's print() rules).
 * A version bump to `@urql/core`/`graphql`/`@0no-co/graphql.web` that
 * changes print() output therefore goes red here immediately, because
 * this script always resolves those packages through this repo's own
 * node_modules — never a vendored or re-pinned copy (team-lead ruling,
 * CHAOS-4696 hard requirement 2).
 *
 * Usage:
 *   tsx scripts/graphql-wire-parity.ts check --ops-root <path-to-ops-checkout>
 *   tsx scripts/graphql-wire-parity.ts generate --ops-root <path> [--json]
 *
 * `check` exits non-zero and prints a mismatch table if ANY manifested
 * operation's Go-side digest and wire-side digest disagree, or if the
 * two sides' operation SETS disagree (a Go operation with no manifest
 * entry, or vice versa) — a silent skip is exactly the failure mode
 * CHAOS-4696 is about, so an unmapped operation is a hard failure, not
 * a warning.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @urql/core is resolved from THIS repo's own node_modules (pinned in
// package.json) — never a copy vendored into this script or into ops.
import { createRequest, formatDocument, stringifyDocument } from "@urql/core";

import { FEATURE_FLAG_REGISTRY_QUERY } from "../src/lib/feature-flags/queries";
import {
    COGNITIVE_LOAD_QUERY,
    COMPLEXITY_TIMESERIES_QUERY,
    FLOW_MATRIX_QUERY,
    HOTSPOTS_QUERY,
    INVESTMENT_BREAKDOWN_QUERY,
    INVESTMENT_FULL_QUERY,
    OPERATING_REVIEW_QUERY,
    REVIEW_EDGES_QUERY,
    WORK_GRAPH_ARTIFACTS_QUERY,
    WORK_GRAPH_EDGES_QUERY,
    WORK_GRAPH_FLOW_QUERY,
} from "../src/lib/graphql/queries";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The manifest: query-api's `digestByOperation` key (query_route.go) ->
 * this repo's LIVE query source export for that operation. Every entry
 * is a real, imported binding — never a string literal copied out of
 * queries.ts — so this manifest cannot silently drift from what
 * graphqlFetch callers actually pass to `client.query(...)`.
 */
export const OPERATION_MANIFEST: Record<string, string> = {
    cognitiveLoad: COGNITIVE_LOAD_QUERY,
    complexityTimeseries: COMPLEXITY_TIMESERIES_QUERY,
    featureFlags: FEATURE_FLAG_REGISTRY_QUERY,
    flowMatrix: FLOW_MATRIX_QUERY,
    hotspots: HOTSPOTS_QUERY,
    investmentBreakdown: INVESTMENT_BREAKDOWN_QUERY,
    investmentFull: INVESTMENT_FULL_QUERY,
    operatingReview: OPERATING_REVIEW_QUERY,
    reviewEdges: REVIEW_EDGES_QUERY,
    workGraphArtifacts: WORK_GRAPH_ARTIFACTS_QUERY,
    workGraphEdges: WORK_GRAPH_EDGES_QUERY,
    workGraphFlow: WORK_GRAPH_FLOW_QUERY,
};

export interface RegistryEntry {
    operation: string;
    document: string;
    const_name: string;
    digest: string;
}

/** sha256(trimmed text), hex — the exact algorithm cmd/query-api/internal/digest.Document implements. */
export function sha256Trim(text: string): string {
    return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * The wire form: what THIS repo's pinned @urql/core actually sends for a
 * query source string, reproduced by calling its real public API, in the
 * SAME order the real exchange pipeline applies it:
 *
 *   1. `createRequest` builds the same KeyedDocumentNode urql's client
 *      builds for `client.query(...)`.
 *   2. `formatDocument` is the exact transform this repo's `cacheExchange`
 *      applies to every query/mutation BEFORE forwarding to
 *      `fetchExchange` (see `mapTypeNames` in
 *      @urql/core/dist/urql-core.js, wired into `cacheExchange`'s
 *      pipeline via `wonka.map(mapTypeNames)`) — it injects `__typename`
 *      into every non-root selection set. `server.ts`'s exchange list is
 *      `[timingExchange, errorExchange, cacheExchange, fetchExchange]`,
 *      so this step is NOT optional for this repo's real traffic.
 *      Skipping it understates the real wire form (verified: a bare
 *      `stringifyDocument(request.query)` with no `formatDocument` step
 *      reproduces CHAOS-4696's own reported wire digest for featureFlags,
 *      `03f73cd3...` — but a real captured request off this repo's own
 *      `graphqlFetch`, through the real exchange chain, digests to
 *      `06ca28a0...` instead, because of this exact __typename
 *      injection; see cmd/query-api/testdata/wire_capture/README.md in
 *      the ops repo for the captured fixture and both digests).
 *   3. `stringifyDocument` is the exact function `fetchExchange` calls on
 *      `request.query` when constructing the HTTP body/URL (see
 *      @urql/core/dist/urql-core-chunk.js's makeFetchBody/makeFetchURL).
 *
 * Not a reimplementation of print()'s line-wrapping or __typename rules —
 * these are the real, pinned functions the production exchange chain
 * calls, invoked in the same order.
 */
export function wireForm(sourceQueryText: string): string {
    const request = createRequest(sourceQueryText, {});
    const formatted = formatDocument(request.query);
    return stringifyDocument(formatted);
}

/** Runs `go run ./cmd/query-api/tools/registrydump` inside opsRoot and parses its JSON. */
function runRegistrydump(opsRoot: string): RegistryEntry[] {
    const result = spawnSync(
        "go",
        ["run", "./cmd/query-api/tools/registrydump", "-file", "cmd/query-api/query_route.go"],
        { cwd: opsRoot, encoding: "utf8", env: { ...process.env, GOTOOLCHAIN: "go1.27.0" } },
    );
    if (result.status !== 0) {
        throw new Error(
            `registrydump failed (exit ${result.status}) in ${opsRoot}:\n${result.stderr}`,
        );
    }
    return JSON.parse(result.stdout) as RegistryEntry[];
}

interface ParityRow {
    operation: string;
    goDigest: string;
    wireDigest: string;
    match: boolean;
}

/**
 * Pure comparison function (exported for the vitest mutation-detection
 * test — see __tests__/graphql-wire-parity.test.ts): given the Go
 * registry entries and the manifest, returns one row per manifested
 * operation plus loud errors for any set mismatch.
 */
export function compareRegistry(
    goEntries: RegistryEntry[],
    manifest: Record<string, string>,
): { rows: ParityRow[]; errors: string[] } {
    const errors: string[] = [];
    const goByOperation = new Map(goEntries.map((entry) => [entry.operation, entry]));

    const goOnly = [...goByOperation.keys()].filter((op) => !(op in manifest));
    const manifestOnly = Object.keys(manifest).filter((op) => !goByOperation.has(op));
    if (goOnly.length > 0) {
        errors.push(
            `query-api registers operation(s) with NO wire-parity manifest entry (scripts/graphql-wire-parity.ts OPERATION_MANIFEST): ${goOnly.join(", ")} — a registered document with no gate coverage is exactly the silent-gap class CHAOS-4696 exists to close. Add it to the manifest.`,
        );
    }
    if (manifestOnly.length > 0) {
        errors.push(
            `OPERATION_MANIFEST names operation(s) query-api does not register: ${manifestOnly.join(", ")} — remove or fix the manifest entry.`,
        );
    }

    const rows: ParityRow[] = [];
    for (const [operation, sourceText] of Object.entries(manifest)) {
        const goEntry = goByOperation.get(operation);
        if (!goEntry) continue; // reported via manifestOnly above
        // A missing/empty `digest` field means the ops checkout's
        // registrydump predates CHAOS-4696's digest field (an older ops
        // main, or a checkout mid-rebase) -- report it as a loud,
        // named error rather than crash later on `.slice()` of
        // `undefined`, or silently comparing against the string
        // "undefined" (which would coincidentally read as a real
        // mismatch for the wrong reason).
        if (typeof goEntry.digest !== "string" || goEntry.digest.length === 0) {
            errors.push(
                `registrydump's entry for operation "${operation}" has no digest field (got ${JSON.stringify(goEntry.digest)}) -- the ops checkout at --ops-root predates CHAOS-4696's registrydump digest field, or its JSON is malformed. Point --ops-root at a checkout that includes cmd/query-api/internal/digest.`,
            );
            continue;
        }
        const goDigest = goEntry.digest;
        const wireDigest = sha256Trim(wireForm(sourceText));
        rows.push({ operation, goDigest, wireDigest, match: goDigest === wireDigest });
    }
    rows.sort((a, b) => a.operation.localeCompare(b.operation));
    return { rows, errors };
}

function parseArgs(argv: string[]) {
    const [mode, ...rest] = argv;
    let opsRoot: string | undefined;
    let json = false;
    for (let i = 0; i < rest.length; i += 1) {
        if (rest[i] === "--ops-root") {
            opsRoot = rest[i + 1];
            i += 1;
        } else if (rest[i] === "--json") {
            json = true;
        }
    }
    return { mode, opsRoot, json };
}

function main() {
    const { mode, opsRoot, json } = parseArgs(process.argv.slice(2));
    if (mode !== "check" && mode !== "generate") {
        process.stderr.write(
            "usage: graphql-wire-parity.ts <check|generate> --ops-root <path> [--json]\n",
        );
        process.exitCode = 2;
        return;
    }
    if (!opsRoot) {
        process.stderr.write("--ops-root is required (path to a dev-health-ops checkout)\n");
        process.exitCode = 2;
        return;
    }

    const goEntries = runRegistrydump(path.resolve(ROOT, opsRoot));
    const { rows, errors } = compareRegistry(goEntries, OPERATION_MANIFEST);

    if (mode === "generate") {
        const out = Object.fromEntries(
            rows.map((r) => [r.operation, wireForm(OPERATION_MANIFEST[r.operation])]),
        );
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
        return;
    }

    // check mode
    const mismatches = rows.filter((r) => !r.match);
    if (json) {
        process.stdout.write(JSON.stringify({ rows, errors }, null, 2) + "\n");
    } else {
        const width = Math.max(...rows.map((r) => r.operation.length), "operation".length);
        process.stdout.write(
            `${"operation".padEnd(width)}  go-digest(12)  wire-digest(12)  result\n`,
        );
        for (const r of rows) {
            process.stdout.write(
                `${r.operation.padEnd(width)}  ${r.goDigest.slice(0, 12)}    ${r.wireDigest.slice(0, 12)}     ${r.match ? "MATCH" : "MISMATCH"}\n`,
            );
        }
        for (const err of errors) process.stderr.write(`ERROR: ${err}\n`);
    }

    if (mismatches.length > 0 || errors.length > 0) {
        process.stderr.write(
            `\ngraphql-wire-parity: FAILED — ${mismatches.length} document(s) digest-mismatch what this repo's pinned @urql/core actually sends, ${errors.length} manifest error(s).\n` +
                "A digest mismatch here means query-api's operationForDocument will 404 a real client request and it will silently fall back to Python (CHAOS-4696).\n",
        );
        process.exitCode = 1;
        return;
    }
    process.stdout.write(
        `\ngraphql-wire-parity: PASSED — ${rows.length}/${rows.length} registered documents match this repo's pinned urql wire form.\n`,
    );
}

// Only run when invoked directly (not when imported by the vitest test).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
