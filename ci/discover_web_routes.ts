#!/usr/bin/env -S pnpm tsx
/**
 * CHAOS-3273 Wave 0 source-discovery: every dev-health-web auth surface --
 * REST routes (App Router `route.ts` handlers under `src/app/api/`) AND
 * Next.js Server Actions (`"use server"` files anywhere under `src/`).
 *
 * Modelled on dev-health-ops's `ci/discover_ops_routes.py` (lane auth-cp/L1):
 * independent re-derivation from source (never trusts
 * `contracts/auth/v1/endpoint-profiles.web.json` itself), one record per
 * discovered surface, and a JSON report a later CI gate can diff the
 * checked-in profile file against.
 *
 * Chris ruled 2026-09-01: Server Actions ARE auth surfaces and count toward
 * coverage (CHAOS-3273 Wave 0). They are NOT routable by static HTTP
 * method+path the way route.ts is -- Next.js dispatches them by an opaque
 * per-build action id, not a path -- so they are keyed on what IS stable in
 * source instead: module path + exported function name. `serverActions`
 * below carries one record per exported function in a `"use server"` file,
 * `id` in the exact form `server_action:<repo-relative module path>#<name>`
 * that `contracts/auth/v1/endpoint-profile.schema.json`'s `id` field
 * describes for `surface_kind: "server_action"`. `serverActionFiles` is kept
 * alongside it as a per-file summary (file -> list of exported names) for
 * reconciliation/visibility; it is not itself a set of gate-checkable rows.
 *
 * A file counts as a Server Action file only when its first non-comment,
 * non-blank line is the `"use server"` directive (file-level opt-in, the
 * only form used in this repo as of this pass -- see DoD reconciliation in
 * the lane report for why a substring search for "use server" over-matches
 * comments). `export type`/`export interface` lines in such a file are
 * type-only and erased at compile time -- Next.js does not require them to
 * be async functions, and they are correctly NOT counted as actions.
 *
 * `src/proxy.ts` (this repo's only middleware -- proxy.ts and middleware.ts
 * cannot coexist in Next.js 16, see docs/auth-system.md) is not a route and
 * is reported separately under `middleware`.
 *
 * Usage:
 *   pnpm tsx ci/discover_web_routes.ts [--root PATH] [--out PATH]
 * Prints a JSON report to stdout (or --out) with:
 *   { routes: [...], serverActions: [...], serverActionFiles: [...],
 *     middleware: {...},
 *     counts: { routes: N, serverActions: N, serverActionFiles: N } }
 */

import { readFileSync, existsSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export type RouteRecord = {
    method: HttpMethod;
    route: string;
    file: string;
    line: number;
};

export type ServerActionFile = {
    file: string;
    exportedFunctionNames: string[];
};

export type ServerActionRecord = {
    id: string;
    file: string;
    exportName: string;
    line: number;
};

// Matches an exported async function declaration whose signature starts on
// this line -- `(` need not close on the same line (multi-line params still
// match, since only the opening paren after the name is required).
const EXPORTED_ASYNC_FUNCTION_RE = /^export\s+async\s+function\s+(\w+)\s*\(/;
// Global variants of the two above, used to count EVERY exported action on a
// line rather than only the one anchored at its start. See the count/parse
// reconciliation in discoverServerActionFiles.
const EXPORTED_ASYNC_FUNCTION_GLOBAL_RE = /export\s+async\s+function\s+(\w+)\s*\(/g;
// `export const foo = async (...) => { ... }` -- not observed in this repo
// as of this pass, but a valid Server Action form; matched defensively so
// discovery does not silently miss one if it appears later.
const EXPORTED_ASYNC_ARROW_RE = /^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*async\s*[( ]/;
const EXPORTED_ASYNC_ARROW_GLOBAL_RE = /export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*async\s*[( ]/g;

function parseArgs(argv: string[]): { root: string; out: string | null } {
    let root = process.cwd();
    let out: string | null = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--root") root = argv[++i];
        else if (argv[i] === "--out") out = argv[++i];
    }
    return { root, out };
}

function* walk(dir: string): Generator<string> {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            yield* walk(full);
        } else if (entry.isFile()) {
            yield full;
        }
    }
}

/**
 * Convert a filesystem path under src/app/api to a Next.js App Router URL
 * path: `[id]` segments become `[id]` verbatim (kept bracketed, matching
 * this repo's convention of documenting the dynamic-segment placeholder
 * rather than resolving a synthetic example value -- there is no route
 * table to resolve it against, unlike FastAPI's runtime include graph).
 * `route.ts` itself is dropped from the tail.
 */
function fileToRoutePath(apiRoot: string, file: string): string {
    const rel = relative(apiRoot, file).replace(/\\/g, "/");
    const withoutFile = rel.replace(/\/route\.tsx?$/, "").replace(/^route\.tsx?$/, "");
    return "/api" + (withoutFile ? "/" + withoutFile : "");
}

const EXPORT_METHOD_RE = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+(${HTTP_METHODS.join("|")})\\s*\\(`,
);
// `export const { GET, POST } = handlers;` (NextAuth catch-all) -- a named
// destructure of a runtime object, not a per-method function. Reported with
// method "api_route" (mirrors ops's convention for a runtime method list),
// matching endpoint-profile.schema.json's `method` field description.
const EXPORT_DESTRUCTURE_RE = /^export\s+const\s*\{([^}]+)\}\s*=\s*handlers\s*;?\s*$/;

function discoverRouteFile(apiRoot: string, file: string): RouteRecord[] {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const routePath = fileToRoutePath(apiRoot, file);
    const records: RouteRecord[] = [];
    let sawDestructure = false;
    lines.forEach((lineText, idx) => {
        const methodMatch = EXPORT_METHOD_RE.exec(lineText.trim());
        if (methodMatch) {
            records.push({
                method: methodMatch[1] as HttpMethod,
                route: routePath,
                file: relative(process.cwd(), file),
                line: idx + 1,
            });
            return;
        }
        if (!sawDestructure && EXPORT_DESTRUCTURE_RE.test(lineText.trim())) {
            sawDestructure = true;
            records.push({
                method: "GET" as HttpMethod, // placeholder; api_route covers both -- see note below
                route: routePath,
                file: relative(process.cwd(), file),
                line: idx + 1,
            });
        }
    });
    // Collapse a destructure-style file (NextAuth) into ONE api_route record
    // rather than one row per destructured name -- matches how this repo's
    // endpoint-profiles.web.json represents it (method: "api_route").
    if (sawDestructure) {
        return [
            {
                method: "api_route" as unknown as HttpMethod,
                route: routePath,
                file: records[0].file,
                line: records[0].line,
            },
        ];
    }
    return records;
}

export function discoverRoutes(root: string): RouteRecord[] {
    const apiRoot = join(root, "src/app/api");
    const out: RouteRecord[] = [];
    for (const file of walk(apiRoot)) {
        if (!/route\.tsx?$/.test(file)) continue;
        out.push(...discoverRouteFile(apiRoot, file));
    }
    out.sort((a, b) => (a.route + a.method).localeCompare(b.route + b.method));
    return out;
}

/**
 * "use server" files -- every file whose first non-comment, non-blank line
 * is the "use server" directive (file-level opt-in). Returns BOTH:
 *   - `files`: one entry per file with its exported action names, for
 *     visibility/reconciliation.
 *   - `actions`: one record per exported Server Action function, keyed
 *     `server_action:<repo-relative module path>#<exported function name>`
 *     -- the independently re-derived surface a CI gate diffs the checked-in
 *     profile rows against. Never keyed on a per-build action id (unstable
 *     across builds by design -- see module docstring).
 */
export function discoverServerActionFiles(root: string): {
    files: ServerActionFile[];
    actions: ServerActionRecord[];
} {
    const files: ServerActionFile[] = [];
    const actions: ServerActionRecord[] = [];
    for (const file of walk(join(root, "src"))) {
        if (!/\.tsx?$/.test(file)) continue;
        if (/\.(test|spec)\.tsx?$/.test(file)) continue;
        const text = readFileSync(file, "utf8");
        const lines = text.split("\n");
        const firstMeaningfulLine = lines.find(
            (l) => l.trim().length > 0 && !l.trim().startsWith("//"),
        );
        if (
            firstMeaningfulLine?.trim() !== '"use server";' &&
            firstMeaningfulLine?.trim() !== "'use server';"
        )
            continue;

        const relFile = relative(process.cwd(), file);
        const exportedFunctionNames: string[] = [];
        lines.forEach((lineText, idx) => {
            const trimmed = lineText.trim();
            // Match EVERY exported action on the line, not just one anchored
            // at its start.
            //
            // CHAOS-3273 merge-gate, EXECUTED: this used a single `.exec()`
            // per line, so two exported actions written on ONE line yielded
            // only the first. With the first profiled and the second not, the
            // gate reported
            //   PASS: 18 routes + 151 server actions, 0 violations.
            // while `betaProbeUnprofiled` was a wholly unprofiled Server
            // Action -- guardrail G-1 defeated by a semicolon. The sibling
            // acr gate had the identical defect in Go (FindStringSubmatch).
            //
            // Worth knowing if you are re-testing this: with BOTH same-line
            // actions unprofiled the gate DOES fail, on the first one. That
            // reads as a catch and is not one; the hole only shows once the
            // first is profiled.
            const names = [
                ...trimmed.matchAll(EXPORTED_ASYNC_FUNCTION_GLOBAL_RE),
                ...trimmed.matchAll(EXPORTED_ASYNC_ARROW_GLOBAL_RE),
            ].map((m) => m[1]);
            if (names.length === 0) return;
            for (const exportName of names) {
                exportedFunctionNames.push(exportName);
                actions.push({
                    id: `server_action:${relFile}#${exportName}`,
                    file: relFile,
                    exportName,
                    line: idx + 1,
                });
            }
        });
        files.push({ file: relFile, exportedFunctionNames });
    }
    files.sort((a, b) => a.file.localeCompare(b.file));
    actions.sort((a, b) => a.id.localeCompare(b.id));
    return { files, actions };
}

export function discoverMiddleware(root: string): { present: boolean; file: string | null } {
    const proxyFile = join(root, "src/proxy.ts");
    const middlewareFile = join(root, "src/middleware.ts");
    if (existsSync(middlewareFile)) {
        return { present: true, file: "src/middleware.ts" };
    }
    if (existsSync(proxyFile) && statSync(proxyFile).isFile()) {
        return { present: true, file: "src/proxy.ts" };
    }
    return { present: false, file: null };
}

function main() {
    const { root, out } = parseArgs(process.argv.slice(2));
    const routes = discoverRoutes(root);
    const { files: serverActionFiles, actions: serverActions } = discoverServerActionFiles(root);
    const middleware = discoverMiddleware(root);
    const report = {
        routes,
        serverActions,
        serverActionFiles,
        middleware,
        counts: {
            routes: routes.length,
            serverActions: serverActions.length,
            serverActionFiles: serverActionFiles.length,
        },
    };
    const json = JSON.stringify(report, null, 2);
    if (out) {
        writeFileSync(out, json + "\n");
    } else {
        process.stdout.write(json + "\n");
    }
}

// Guarded so ci/gate_web_auth_profiles.ts (and its tests) can `import` the
// discovery functions above without triggering a second stdout report/exit
// as a side effect of the import.
const isDirectRun =
    typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main();
}
