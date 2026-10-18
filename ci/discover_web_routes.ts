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
import ts from "typescript";

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

// CHAOS-4792: discovery reads the TypeScript AST, never source text. The text
// matcher it replaces enumerated the spellings its author thought of while the
// language accepts more (`export const GET = ...`, semicolonless directives,
// .js route files). Every module extension Next.js resolves is parsed.
const SOURCE_FILE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// Next serves `route.<pageExtension>`; pageExtensions may carry a dotted
// prefix (next.config.js sets "demo.ts" for demo builds, so route.demo.ts is a
// route there). Any dotted segments before a ts/tsx/js/jsx ending count, because
// the config is evaluated per build and discovery must cover every build.
// route.mjs/.cjs are never page extensions of this app.
const ROUTE_FILE_RE = /(?:^|\/)route(?:\.[\w-]+)*\.(?:tsx|ts|jsx|js)$/;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION_FILE_RE = /\.d\.[cm]?ts$/;

function parseSource(file: string): ts.SourceFile {
    return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function hasExportModifier(node: ts.Node): boolean {
    return (
        ts.canHaveModifiers(node) &&
        (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    );
}

function hasDefaultModifier(node: ts.Node): boolean {
    return (
        ts.canHaveModifiers(node) &&
        (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    );
}

type ExportedName = {
    name: string;
    line: number;
    viaHandlers: boolean;
    wildcard: boolean;
    from?: string;
};

/**
 * Every value name a module exports, from the AST: declarations
 * (function/class/const/let/var, destructured bindings), `export { a as B }`,
 * `export { B } from "./x"`, `export * from "./x"` (reported as a wildcard --
 * the re-exported names cannot be resolved here, so callers treat it as a
 * surface they cannot prove absent), and `export default`. Type-only exports
 * are erased at compile time and skipped.
 */
function exportedNames(sf: ts.SourceFile): ExportedName[] {
    const out: ExportedName[] = [];
    const add = (name: string, node: ts.Node, viaHandlers = false, wildcard = false) =>
        out.push({
            name,
            line: lineOf(sf, node),
            viaHandlers,
            wildcard,
            from:
                ts.isExportDeclaration(node) &&
                node.moduleSpecifier &&
                ts.isStringLiteral(node.moduleSpecifier)
                    ? node.moduleSpecifier.text
                    : undefined,
        });
    const bindingNames = (b: ts.BindingName, into: string[]) => {
        if (ts.isIdentifier(b)) into.push(b.text);
        else for (const el of b.elements) if (ts.isBindingElement(el)) bindingNames(el.name, into);
    };
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && hasExportModifier(st)) {
            add(hasDefaultModifier(st) ? "default" : (st.name?.text ?? "default"), st);
        } else if (ts.isClassDeclaration(st) && hasExportModifier(st)) {
            add(hasDefaultModifier(st) ? "default" : (st.name?.text ?? "default"), st);
        } else if (ts.isVariableStatement(st) && hasExportModifier(st)) {
            for (const decl of st.declarationList.declarations) {
                const names: string[] = [];
                bindingNames(decl.name, names);
                const viaHandlers =
                    !ts.isIdentifier(decl.name) &&
                    decl.initializer !== undefined &&
                    ts.isIdentifier(decl.initializer) &&
                    decl.initializer.text === "handlers";
                for (const n of names) add(n, st, viaHandlers);
            }
        } else if (ts.isExportAssignment(st)) {
            add("default", st);
        } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
            const clause = st.exportClause;
            if (!clause) add("*", st, false, true);
            else if (ts.isNamespaceExport(clause)) add(clause.name.text, st);
            else for (const spec of clause.elements) if (!spec.isTypeOnly) add(spec.name.text, st);
        }
    }
    return out;
}

/**
 * Convert a filesystem path under src/app to a Next.js App Router URL path.
 *
 * `[id]` segments are kept bracketed verbatim, matching this repo's
 * convention of documenting the dynamic-segment placeholder rather than
 * resolving a synthetic example value -- there is no route table to resolve
 * it against, unlike FastAPI's runtime include graph. `route.<ext>` itself is
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
    const withoutFile = rel.replace(ROUTE_FILE_RE, "");
    if (!withoutFile) return "/";
    const segments = withoutFile
        .split("/")
        .filter((seg) => seg.length > 0 && !(seg.startsWith("(") && seg.endsWith(")")));
    return "/" + segments.join("/");
}

const compilerOptionsByRoot = new Map<string, ts.CompilerOptions>();

// The project's own compiler options (tsconfig `paths` such as "@/*" included),
// so module resolution matches tsc. `types: []` keeps ambient @types out of the
// program: discovery needs the import graph of the files it asks about, not
// the whole dependency typing.
function compilerOptions(root: string): ts.CompilerOptions {
    let options = compilerOptionsByRoot.get(root);
    if (!options) {
        const configPath = join(root, "tsconfig.json");
        const read = existsSync(configPath) ? ts.readConfigFile(configPath, ts.sys.readFile) : null;
        const parsed = read?.config
            ? ts.parseJsonConfigFileContent(read.config, ts.sys, root).options
            : {};
        options = {
            ...parsed,
            allowJs: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            module: ts.ModuleKind.ESNext,
        };
        compilerOptionsByRoot.set(root, options);
    }
    return options;
}

function buildProgram(root: string, files: string[]): ts.Program {
    return ts.createProgram({ rootNames: files, options: compilerOptions(root) });
}

/**
 * The value names a module exports, as the TypeScript checker computes them:
 * `export *` (any depth, cycle-safe), aliases, re-exports and path aliases are
 * resolved the way tsc resolves them. Type-only exports are dropped. An
 * `export * from` whose module the checker cannot resolve is reported via
 * `unresolvedWildcard`: it could export anything, so callers must demand a row
 * for every possibility instead of silently seeing nothing.
 */
function checkerExports(
    program: ts.Program,
    file: string,
): { names: string[]; unresolvedWildcard: boolean } {
    const sf = program.getSourceFile(file);
    if (!sf) return { names: [], unresolvedWildcard: true };
    const checker = program.getTypeChecker();
    let unresolvedWildcard = false;
    for (const st of sf.statements) {
        if (
            ts.isExportDeclaration(st) &&
            !st.isTypeOnly &&
            !st.exportClause &&
            st.moduleSpecifier &&
            !checker.getSymbolAtLocation(st.moduleSpecifier)
        )
            unresolvedWildcard = true;
    }
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) return { names: [], unresolvedWildcard };
    const names: string[] = [];
    for (const sym of checker.getExportsOfModule(moduleSymbol)) {
        if (sym.name === "export=") continue;
        const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
        // An alias the checker cannot resolve comes back as the unknown symbol,
        // which carries Value flags: counted, never dropped.
        if (target.flags & ts.SymbolFlags.Value) names.push(sym.name);
    }
    return { names, unresolvedWildcard };
}

function discoverRouteFile(appRoot: string, file: string, program: ts.Program): RouteRecord[] {
    const sf = parseSource(file);
    const routePath = fileToRoutePath(appRoot, file);
    const relFile = relative(process.cwd(), file);
    const own = exportedNames(sf);
    // `export const { GET, POST } = handlers;` (NextAuth catch-all) -- a
    // destructure of a runtime object, not a per-method function. One record
    // with method "api_route" (mirrors ops's convention for a runtime method
    // list), matching endpoint-profile.schema.json's `method` field.
    const destructure = own.find(
        (n) => n.viaHandlers && (HTTP_METHODS as readonly string[]).includes(n.name),
    );
    if (destructure) {
        return [
            {
                method: "api_route" as unknown as HttpMethod,
                route: routePath,
                file: relFile,
                line: destructure.line,
            },
        ];
    }
    const wildcardLine = own.find((n) => n.wildcard)?.line ?? 1;
    const lineByName = new Map<string, number>();
    for (const n of own) if (!lineByName.has(n.name)) lineByName.set(n.name, n.line);
    const { names, unresolvedWildcard } = checkerExports(program, file);
    const methods = new Set<string>(
        names.filter((n) => (HTTP_METHODS as readonly string[]).includes(n)),
    );
    // An export * the checker cannot resolve might export any method; each
    // possibility demands its own row (one row never covers several handlers).
    if (unresolvedWildcard) for (const m of HTTP_METHODS) methods.add(m);
    return [...methods].map((m) => ({
        method: m as HttpMethod,
        route: routePath,
        file: relFile,
        line: lineByName.get(m) ?? wildcardLine,
    }));
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

function parseArgs(argv: string[]): { root: string; out: string | null } {
    let root = process.cwd();
    let out: string | null = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--root") root = argv[++i];
        else if (argv[i] === "--out") out = argv[++i];
    }
    return { root, out };
}

export function discoverRoutes(root: string): RouteRecord[] {
    const appRoot = join(root, "src/app");
    const files: string[] = [];
    for (const file of walk(appRoot)) {
        if (!ROUTE_FILE_RE.test(file) || DECLARATION_FILE_RE.test(file) || TEST_FILE_RE.test(file))
            continue;
        files.push(file);
    }
    const out: RouteRecord[] = [];
    if (files.length > 0) {
        const program = buildProgram(root, files);
        for (const file of files) out.push(...discoverRouteFile(appRoot, file, program));
    }
    out.sort((a, b) => (a.route + a.method).localeCompare(b.route + b.method));
    return out;
}

/** True when a statement list opens with a `"use server"` directive (any quote, with or without `;`). */
function hasUseServerDirective(statements: readonly ts.Statement[]): boolean {
    for (const st of statements) {
        if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false;
        // Compare the string VALUE: Next accepts "use\x20server", and a
        // false positive here only demands a row, never hides a surface.
        if (st.expression.text === "use server") return true;
    }
    return false;
}

function functionBody(node: ts.Node): ts.Block | undefined {
    if (
        (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) &&
        node.body &&
        ts.isBlock(node.body)
    )
        return node.body;
    return undefined;
}

function inlineActionName(node: ts.Node): string | null {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name)
        return node.name.getText();
    if (ts.isFunctionExpression(node) && node.name) return node.name.text;
    const parent = node.parent;
    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
        return parent.name.text;
    if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name))
        return parent.name.text;
    return null;
}

/**
 * Server Actions -- both Next.js forms:
 *   - FILE-level: a module whose directive prologue holds "use server"; every
 *     value it exports is an action.
 *   - FUNCTION-level: a function whose body opens with "use server" (inline
 *     action in a server component or any other module).
 * Returns BOTH:
 *   - `files`: one entry per file with its action names, for
 *     visibility/reconciliation.
 *   - `actions`: one record per Server Action, keyed
 *     `server_action:<repo-relative module path>#<name>`
 *     -- the independently re-derived surface a CI gate diffs the checked-in
 *     profile rows against. Never keyed on a per-build action id (unstable
 *     across builds by design -- see module docstring). An inline action with
 *     no name is keyed `anonymous@L<line>`.
 *
 * `export *` in a file-level module is reported under the name `*`: the
 * re-exported actions cannot be resolved here, so it demands a row.
 */
export function discoverServerActionFiles(root: string): {
    files: ServerActionFile[];
    actions: ServerActionRecord[];
} {
    const files: ServerActionFile[] = [];
    const actions: ServerActionRecord[] = [];
    type Found = {
        file: string;
        relFile: string;
        fileLevel: boolean;
        sf: ts.SourceFile;
        inline: { name: string; line: number }[];
    };
    const found: Found[] = [];
    for (const file of walk(join(root, "src"))) {
        if (!SOURCE_FILE_RE.test(file) || TEST_FILE_RE.test(file) || DECLARATION_FILE_RE.test(file))
            continue;
        // Sound pre-filter: without a backslash a string literal's raw text IS
        // its value, so a directive reading "use server" must contain "server".
        const text = readFileSync(file, "utf8");
        if (!text.includes("server") && !text.includes("\\")) continue;
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const relFile = relative(process.cwd(), file);
        if (hasUseServerDirective(sf.statements)) {
            found.push({ file, relFile, fileLevel: true, sf, inline: [] });
            continue;
        }
        const inline: { name: string; line: number }[] = [];
        const used = new Set<string>();
        const visit = (node: ts.Node) => {
            const body = functionBody(node);
            if (body && hasUseServerDirective(body.statements)) {
                const line = lineOf(sf, node);
                let name = inlineActionName(node) ?? `anonymous@L${line}`;
                if (used.has(name)) name = `${name}@L${line}`;
                used.add(name);
                inline.push({ name, line });
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
        if (inline.length > 0) found.push({ file, relFile, fileLevel: false, sf, inline });
    }
    const fileLevel = found.filter((f) => f.fileLevel);
    const program =
        fileLevel.length > 0
            ? buildProgram(
                  root,
                  fileLevel.map((f) => f.file),
              )
            : null;
    for (const f of found) {
        let names: { name: string; line: number }[];
        if (f.fileLevel && program) {
            const own = exportedNames(f.sf);
            const wildcardLine = own.find((n) => n.wildcard)?.line ?? 1;
            const lineByName = new Map<string, number>();
            for (const n of own) if (!lineByName.has(n.name)) lineByName.set(n.name, n.line);
            const { names: exported, unresolvedWildcard } = checkerExports(program, f.file);
            names = exported.map((name) => ({ name, line: lineByName.get(name) ?? wildcardLine }));
            // An unresolvable `export *` could export actions: demand a row.
            if (unresolvedWildcard) names.push({ name: "*", line: wildcardLine });
        } else {
            names = f.inline;
        }
        if (names.length === 0) continue;
        for (const n of names) {
            actions.push({
                id: `server_action:${f.relFile}#${n.name}`,
                file: f.relFile,
                exportName: n.name,
                line: n.line,
            });
        }
        files.push({ file: f.relFile, exportedFunctionNames: names.map((n) => n.name) });
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
