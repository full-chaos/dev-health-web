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
 * Convert a filesystem path under src/app to a Next.js App Router URL path.
 *
 * `[id]` segments are kept bracketed verbatim, matching this repo's
 * convention of documenting the dynamic-segment placeholder rather than
 * resolving a synthetic example value -- there is no route table to resolve
 * it against, unlike FastAPI's runtime include graph. `route.ts` itself is
 * dropped from the tail.
 *
 * ROUTE GROUPS are stripped: a directory whose name is wrapped in
 * parentheses, `(app)`, organises files without contributing a URL segment.
 * Getting this wrong would not lose a route, but it would give it a path
 * that does not exist, which is a stale claim of a different kind.
 *
 * This walks all of src/app, not src/app/api. Merge-gate round 1
 * (CHAOS-3273, EXECUTED): discovery walked only the api subtree, while Next
 * Route Handlers may live anywhere under app/. Three real handlers sat
 * outside it and none was in the inventory -- two of them authenticated
 * admin surfaces enforcing an inline admin/owner role check. The inventory
 * claimed 18 routes; the repository had 21.
 */
function fileToRoutePath(appRoot: string, file: string): string {
    const rel = relative(appRoot, file).replace(/\\/g, "/");
    const withoutFile = rel.replace(/\/route\.tsx?$/, "").replace(/^route\.tsx?$/, "");
    if (!withoutFile) return "/";
    const segments = withoutFile
        .split("/")
        .filter((seg) => seg.length > 0 && !(seg.startsWith("(") && seg.endsWith(")")));
    return "/" + segments.join("/");
}

const EXPORT_METHOD_RE = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+(${HTTP_METHODS.join("|")})\\s*\\(`,
);
// `export const { GET, POST } = handlers;` (NextAuth catch-all) -- a named
// destructure of a runtime object, not a per-method function. Reported with
// method "api_route" (mirrors ops's convention for a runtime method list),
// matching endpoint-profile.schema.json's `method` field description.
const EXPORT_DESTRUCTURE_RE = /^export\s+const\s*\{([^}]+)\}\s*=\s*handlers\s*;?\s*$/;
// `export { handler as POST };` and `export { GET };` -- a re-export of a
// binding defined elsewhere in the file (commonly an arrow function). Merge-gate
// round 1 (CHAOS-3273, EXECUTED): a route file whose only export took this
// shape was invisible, so a hidden POST handler sat beside a profiled GET and
// the gate reported `PASS: 1 routes + 0 server actions, 0 violations`. It is
// legal TypeScript and a normal way to write a handler, not an exotic form.
const EXPORT_NAMED_RE = /^export\s*\{([^}]+)\}\s*;?\s*$/;

function discoverRouteFile(appRoot: string, file: string): RouteRecord[] {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const routePath = fileToRoutePath(appRoot, file);
    const records: RouteRecord[] = [];
    let sawDestructure = false;
    lines.forEach((lineText, idx) => {
        // `export { handler as POST, other as GET };` -- take the EXPORTED
        // name (after `as`), which is what Next dispatches on, not the local
        // binding's name.
        const namedMatch = EXPORT_NAMED_RE.exec(lineText.trim());
        if (namedMatch && !/=\s*handlers/.test(lineText)) {
            for (const clause of namedMatch[1].split(",")) {
                const exported = clause.includes(" as ")
                    ? clause.split(" as ")[1].trim()
                    : clause.trim();
                if ((HTTP_METHODS as readonly string[]).includes(exported)) {
                    records.push({
                        method: exported as HttpMethod,
                        route: routePath,
                        file: relative(process.cwd(), file),
                        line: idx + 1,
                    });
                }
            }
        }
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
    const appRoot = join(root, "src/app");
    const out: RouteRecord[] = [];
    for (const file of walk(appRoot)) {
        if (!/route\.tsx?$/.test(file)) continue;
        out.push(...discoverRouteFile(appRoot, file));
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
        // Find the first meaningful line, skipping blank lines, // comments
        // AND /* block comments */. Merge-gate round 1 (CHAOS-3273, EXECUTED):
        // only `//` was skipped, so a "use server" file preceded by a block
        // comment -- a licence header, a docstring, anything -- was not
        // recognised as a Server Action module at all, and every action in it
        // was invisible to the gate.
        const firstMeaningfulLine = (() => {
            let inBlockComment = false;
            for (const raw of lines) {
                let l = raw.trim();
                if (inBlockComment) {
                    const end = l.indexOf("*/");
                    if (end === -1) continue;
                    l = l.slice(end + 2).trim();
                    inBlockComment = false;
                }
                while (l.startsWith("/*")) {
                    const end = l.indexOf("*/", 2);
                    if (end === -1) {
                        inBlockComment = true;
                        l = "";
                        break;
                    }
                    l = l.slice(end + 2).trim();
                }
                if (l.length === 0 || l.startsWith("//")) continue;
                return l;
            }
            return undefined;
        })();
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
