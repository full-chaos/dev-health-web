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
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Call-walk verdict for one advisory field: a symbol of the field's closed set
 * is reachable from the handler, provably is not (every call resolved, none
 * reached it), or the walk hit its bound. Only not_reachable can prove absent.
 */
export type Reach = "reachable" | "not_reachable" | "limit";

export type RouteRecord = {
    method: HttpMethod;
    route: string;
    file: string;
    line: number;
    /**
     * true: the handler (or a function it calls, transitively) contains a
     * rejecting guard (see isDemonstrablyRejecting). false: none found.
     * undefined: the handler could not be resolved to a function, so no claim.
     */
    guarded?: boolean;
    /** The call walk hit its depth bound: guard state unresolved (the gate fails closed). */
    guardUnresolved?: true;
    /** Call-walk verdict for an ENTITLEMENT_SYMBOLS member; undefined: handler not resolved. */
    entitlement?: Reach;
    /** Call-walk verdict for a cache read or write, a cache directive or a Cache-Control header. */
    cache?: Reach;
    /** Call-walk verdict for resolving the target resource: session or org helpers, request input, action parameters. */
    resolver?: Reach;
    /** Call-walk verdict for a credential read (GUARD_SYMBOLS or an inline reject), unresolved calls = limit. */
    credential?: Reach;
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
    guarded?: boolean;
    guardUnresolved?: true;
    entitlement?: Reach;
    /** Call-walk verdict for a cache read or write, a cache directive or a Cache-Control header. */
    cache?: Reach;
    /** Call-walk verdict for resolving the target resource: session or org helpers, request input, action parameters. */
    resolver?: Reach;
    /** Call-walk verdict for a credential read (GUARD_SYMBOLS or an inline reject), unresolved calls = limit. */
    credential?: Reach;
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

// ---------------------------------------------------------------------------
// Guard detection (CHAOS-4780): what discovery can say about a handler's
// protection, from source. See the HONESTY LIMIT block in
// gate_web_auth_profiles.ts for what a lexical guard match does and does not
// prove.
// ---------------------------------------------------------------------------

// See the ★ HONESTY LIMIT block in the module docstring before extending or
// relying on this list beyond what it proves.
export const REJECTING_GUARD_NAMES = [
    "getSessionContext",
    "requireSuperuserToken",
    "getToken",
    "resolveOrgId",
    "getAuthHeaders",
    "getAuthHeadersOrThrow",
    "apiRequest",
    "withAuthHeaders",
];
export const REJECTING_GUARD_RE = new RegExp(`\\b(?:${REJECTING_GUARD_NAMES.join("|")})\\b`);
// Hand-rolled inline reject shapes, each verified by hand at its own call
// site (not routed through a named helper, but still an unconditional
// return/throw on no session):
export const INLINE_REJECT_PATTERNS = [
    // checkout.ts's createBillingPlan/updateBillingPlan/deleteBillingPlan/
    // syncBillingPlanToStripe/listBillingPlans (listBillingPlans fixed
    // CHAOS-3273 Wave 0, 2026-09-01): `if (!session?.access_token) return ...`.
    // The DEGRADING counterexample this gate exists to catch (listBillingPlans
    // before its fix) used `session?.access_token` only inside an `if` whose
    // body ATTACHES a header -- no `return`/`throw` -- so requiring `return`
    // or `throw` on the SAME lexical scan is what distinguishes the two, not
    // just the presence of the `access_token` check.
    /!\s*session\?\.access_token\)[^]*?(?:return|throw)/,
    // feature-flags/actions.ts's fetchFlagPage (CHAOS-4728, merged fcc3c1db):
    // `if (!session?.user?.org_id) { throw new Error(AuthErrors.Unauthorized); }`.
    /!\s*session\?\.user\?\.org_id\)[^]*?(?:return|throw)/,
];

export function isDemonstrablyRejecting(snippet: string): boolean {
    return (
        REJECTING_GUARD_RE.test(snippet) || INLINE_REJECT_PATTERNS.some((re) => re.test(snippet))
    );
}

// The guard FUNCTIONS, declared once: a call counts as guarded only when the
// type checker resolves it to one of these declarations (file suffix + name).
// A local helper that merely shares a name does not count; an aliased import
// of one of these does. verifyGuardSymbols() checks that each one still
// rejects (see below), so a guard whose body is hollowed out fails the gate.
export const GUARD_SYMBOLS: readonly { file: string; name: string }[] = [
    { file: "src/lib/admin/server/_shared.ts", name: "getSessionContext" },
    { file: "src/lib/admin/server/_shared.ts", name: "requireSuperuserToken" },
    { file: "src/lib/admin/server/_shared.ts", name: "getToken" },
    { file: "src/lib/billing/actions/_shared.ts", name: "getAuthHeaders" },
    { file: "src/lib/billing/actions/_shared.ts", name: "getAuthHeadersOrThrow" },
    { file: "src/lib/billing/actions/_shared.ts", name: "apiRequest" },
];

// The entitlement GATES (functions that reject a caller lacking a feature), declared once, same
// resolution rules as GUARD_SYMBOLS. Readers of the flag are not gates.
// An advisory `entitlement_requirement` may be absent only when the call walk
// reaches none of these; verifyEntitlementSymbols() fails when one is renamed
// or removed, so the set cannot silently go stale.
// `calls` are callee names the body must still call; `rejects` says the body
// must itself throw on a condition computed from those calls' results (a
// delegating gate only has to call the gate it delegates to).
export const ENTITLEMENT_SYMBOLS: readonly {
    file: string;
    name: string;
    calls: readonly string[];
    rejects: boolean;
}[] = [
    {
        file: "src/lib/admin/server/canonicalIncidentIngestion.ts",
        name: "requirePagerDutyCreationEntitlement",
        calls: ["getCanonicalIncidentIngestionEntitlement"],
        rejects: true,
    },
    {
        file: "src/lib/acr/ops.ts",
        name: "requireAcrEntitlement",
        calls: ["fetchBoundedJson", "safeParse"],
        rejects: true,
    },
    {
        file: "src/lib/acr/ops.ts",
        name: "resolveOpsCredentialIssuanceAuthorization",
        calls: ["requireAcrEntitlement"],
        rejects: false,
    },
];

// Cache reads/writes and directives. The library names are matched by name and
// the package they are declared in; verifyCacheSymbols() fails when an upgrade
// renames one, so the set cannot silently empty.
export const CACHE_SYMBOLS: readonly {
    module: string;
    names: readonly string[];
    pkgs: readonly string[];
}[] = [
    {
        module: "next/cache",
        names: ["revalidatePath", "revalidateTag", "updateTag", "refresh", "unstable_cache"],
        pkgs: ["/node_modules/next/"],
    },
    {
        module: "react",
        names: ["cache"],
        pkgs: ["/node_modules/react/", "/node_modules/@types/react/"],
    },
];

// The resolvers of the target resource: where the org or the resource a request
// acts on comes from. Request input (an action parameter, a route reading its
// body, query or params) is a resolver too; see isRequestInput().
export const RESOLVER_SYMBOLS: readonly { file: string; name: string }[] = [
    { file: "src/lib/admin/server/_shared.ts", name: "getSessionContext" },
    { file: "src/lib/admin/server/_shared.ts", name: "requireSuperuserToken" },
    { file: "src/lib/admin/server/_shared.ts", name: "getToken" },
    { file: "src/lib/billing/actions/_shared.ts", name: "getAuthHeaders" },
    { file: "src/lib/billing/actions/_shared.ts", name: "getAuthHeadersOrThrow" },
    { file: "src/lib/billing/actions/_shared.ts", name: "apiRequest" },
    { file: "src/lib/billing/actions/_shared.ts", name: "resolveOrgId" },
    { file: "src/lib/admin/server/orgs.ts", name: "getCurrentOrg" },
    { file: "src/lib/auth.ts", name: "auth" },
    { file: "src/lib/feature-flags/fetchers.ts", name: "resolveOrgId" },
    { file: "src/lib/areaSignals/improve.ts", name: "resolveOrgId" },
    { file: "src/lib/areaSignals/ai.ts", name: "resolveOrgId" },
    { file: "src/lib/areaSignals/diagnose.ts", name: "resolveOrgId" },
    { file: "src/lib/areaSignals/govern.ts", name: "resolveOrgId" },
];

// The closed list of inline reject shapes: `if (<condition>) { ...; return|throw ... }`
// where the condition text is exactly one of these and the branch itself holds
// a return or throw statement. Matched on the AST, not on text.
export const INLINE_REJECT_CONDITIONS: readonly string[] = [
    "!session?.access_token",
    "!session?.user?.org_id",
];

const isExit = (s: ts.Statement) => ts.isReturnStatement(s) || ts.isThrowStatement(s);

/** A literal `if (false)`-style condition: true/false when constant, undefined otherwise. */
function constantCondition(e: ts.Expression): boolean | undefined {
    if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (
        e.kind === ts.SyntaxKind.FalseKeyword ||
        e.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isNumericLiteral(e) && Number(e.text) === 0) ||
        (ts.isIdentifier(e) && e.text === "undefined")
    )
        return false;
    return undefined;
}

/**
 * Walk only code that can run: statements after a top-level return/throw in a
 * block are dead, and the dead arm of an `if (<literal>)` is skipped. `f`
 * returns false to stop descending into a node.
 */
function walkLive(node: ts.Node, f: (n: ts.Node) => boolean | void): void {
    if (f(node) === false) return;
    if (ts.isBlock(node)) {
        for (const s of node.statements) {
            walkLive(s, f);
            if (isExit(s)) break;
        }
        return;
    }
    if (ts.isIfStatement(node)) {
        const c = constantCondition(node.expression);
        walkLive(node.expression, f);
        if (c !== false) walkLive(node.thenStatement, f);
        if (c !== true && node.elseStatement) walkLive(node.elseStatement, f);
        return;
    }
    ts.forEachChild(node, (c) => walkLive(c, f));
}

/** `if (<closed condition>) { ...; return|throw ...; }` -- the branch itself exits. */
function isInlineRejectIf(n: ts.Node): boolean {
    if (
        !ts.isIfStatement(n) ||
        !INLINE_REJECT_CONDITIONS.includes(n.expression.getText().replace(/\s+/g, ""))
    )
        return false;
    const then = n.thenStatement;
    return isExit(then) || (ts.isBlock(then) && then.statements.some(isExit));
}

function isInlineReject(node: ts.Node): boolean {
    let found = false;
    walkLive(node, (n) => {
        if (found) return false;
        if (isInlineRejectIf(n)) {
            found = true;
            return false;
        }
    });
    return found;
}

/**
 * A call whose result is awaited or returned. A guard call that is neither
 * (`getToken();`, `void getToken()`) rejects into an unobserved promise and
 * protects nothing.
 */
function isConsumed(call: ts.CallExpression): boolean {
    for (let n: ts.Node | undefined = call.parent; n; n = n.parent) {
        if (ts.isAwaitExpression(n) || ts.isReturnStatement(n)) return true;
        if (ts.isArrowFunction(n) && !ts.isBlock(n.body)) {
            // expression-bodied arrow: its value is returned to the caller
            return true;
        }
        if (ts.isStatement(n) || ts.isFunctionLike(n)) return false;
    }
    return false;
}

function isDeclarationOf(set: readonly { file: string; name: string }[], decl: ts.Node): boolean {
    const name = (decl as ts.NamedDeclaration).name;
    if (!name || !ts.isIdentifier(name)) return false;
    const file = decl.getSourceFile().fileName.replace(/\\/g, "/");
    return set.some((g) => g.name === name.text && file.endsWith("/" + g.file));
}

function isGuardDeclaration(decl: ts.Node): boolean {
    return isDeclarationOf(GUARD_SYMBOLS, decl);
}

/** What the call walk looks for: a declaration of the target set, or an inline shape. */
type Probe = {
    isTarget: (decl: ts.Node) => boolean;
    inline: (node: ts.Node) => boolean;
    /** A proof of ABSENCE: a call the walk cannot resolve to a body makes the verdict "limit". */
    strict?: boolean;
};
const GUARD_PROBE: Probe = { isTarget: isGuardDeclaration, inline: (n) => isInlineReject(n) };
const CREDENTIAL_PROBE: Probe = { ...GUARD_PROBE, strict: true };
const CACHE_PROBE: Probe = {
    isTarget: isCacheDeclaration,
    inline: (n) => liveContains(n, isCacheDirective),
    strict: true,
};
const RESOLVER_PROBE: Probe = {
    isTarget: (d) => isDeclarationOf(RESOLVER_SYMBOLS, d),
    inline: (n) => liveContains(n, isRequestInput),
    strict: true,
};
const ENTITLEMENT_PROBE: Probe = {
    isTarget: (d) => isDeclarationOf(ENTITLEMENT_SYMBOLS, d),
    inline: () => false,
    strict: true,
};

function isCacheDeclaration(decl: ts.Node): boolean {
    const name = (decl as ts.NamedDeclaration).name;
    if (!name || !ts.isIdentifier(name)) return false;
    const file = decl.getSourceFile().fileName.replace(/\\/g, "/");
    return CACHE_SYMBOLS.some(
        (c) => c.names.includes(name.text) && c.pkgs.some((pk) => file.includes(pk)),
    );
}

/** Live code holding a node that satisfies `pred`. */
function liveContains(node: ts.Node, pred: (n: ts.Node) => boolean): boolean {
    let found = false;
    walkLive(node, (n) => {
        if (found) return false;
        if (pred(n)) {
            found = true;
            return false;
        }
    });
    return found;
}

const CACHE_OPTION_NAMES = new Set(["cache", "next"]);

/** `fetch(url, { cache | next })` or the string "Cache-Control": a cache directive written in place. */
function isCacheDirective(n: ts.Node): boolean {
    if (ts.isStringLiteralLike(n)) return /^cache-control$/i.test(n.text);
    if (!ts.isCallExpression(n)) return false;
    const callee = n.expression;
    const isFetch =
        (ts.isIdentifier(callee) && callee.text === "fetch") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch");
    return (
        isFetch &&
        n.arguments.some(
            (a) =>
                ts.isObjectLiteralExpression(a) &&
                a.properties.some(
                    (p) =>
                        (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                        (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
                        CACHE_OPTION_NAMES.has(p.name.text),
                ),
        )
    );
}

const REQUEST_INPUT_NAMES = new Set([
    "json",
    "formData",
    "text",
    "searchParams",
    "nextUrl",
    "url",
    "params",
]);

/** A route reading its request body, query or path params. */
function isRequestInput(n: ts.Node): boolean {
    if (ts.isPropertyAccessExpression(n)) return REQUEST_INPUT_NAMES.has(n.name.text);
    return ts.isIdentifier(n) && n.text === "params";
}

const MAX_GUARD_DEPTH = 10;

/**
 * A call the walk can see into: every declaration it resolves to is library
 * code (a declaration file or node_modules) or has a function body in the
 * project. A callee that is a parameter, an interface member or has no
 * declaration may run anything, so it cannot support a claim of absence.
 */
function callResolves(checker: ts.TypeChecker, callee: ts.Expression): boolean {
    const decls = resolveDeclarations(checker, callee);
    if (decls.length === 0) return false;
    return decls.every((decl) => {
        const sf = decl.getSourceFile();
        if (sf.isDeclarationFile || sf.fileName.includes("/node_modules/")) return true;
        return functionLikesOf(checker, decl).length > 0;
    });
}

/** The project class a `new` expression constructs; undefined for a function or library constructor. */
function classOf(checker: ts.TypeChecker, ref: ts.Node): ts.ClassLikeDeclaration | undefined {
    for (const decl of resolveDeclarations(checker, ref)) {
        const sf = decl.getSourceFile();
        if (sf.isDeclarationFile || sf.fileName.includes("/node_modules/")) continue;
        if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) return decl;
    }
    return undefined;
}

const isLibraryFile = (sf: ts.SourceFile) =>
    sf.isDeclarationFile || sf.fileName.includes("/node_modules/");

const isProjectDecl = (d: ts.Node) => !isLibraryFile(d.getSourceFile());

const PRIMITIVE_FLAGS =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.ESSymbolLike |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Void |
    ts.TypeFlags.Never;

/**
 * Whether a value of this type can run project code when a library or the
 * language merely touches it (JSON.stringify -> toJSON, a spread or a read ->
 * a getter, string conversion -> toString, await -> then, a callback stored on
 * it): any member declared in the project that is a method, an accessor or
 * callable. `any` and unknown shapes count; the check is bounded.
 */
function mayRunProjectCode(checker: ts.TypeChecker, type: ts.Type, depth = 0): boolean {
    if (depth > 3) return true;
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
    if (type.flags & PRIMITIVE_FLAGS) return false;
    if (type.isUnionOrIntersection())
        return type.types.some((t) => mayRunProjectCode(checker, t, depth + 1));
    if (checker.isArrayType(type) || checker.isTupleType(type))
        return checker
            .getTypeArguments(type as ts.TypeReference)
            .some((t) => mayRunProjectCode(checker, t, depth + 1));
    if (type.getCallSignatures().length > 0) return true;
    for (const prop of checker.getPropertiesOfType(type)) {
        const decls = prop.declarations ?? [];
        if (!decls.some(isProjectDecl)) continue;
        if (
            decls.some(
                (d) =>
                    ts.isGetAccessor(d) ||
                    ts.isSetAccessor(d) ||
                    ts.isMethodDeclaration(d) ||
                    ts.isMethodSignature(d),
            )
        )
            return true;
        const t = checker.getTypeOfSymbolAtLocation(prop, decls[0]);
        if (mayRunProjectCode(checker, t, depth + 1)) return true;
    }
    return false;
}

/** Accessors (getter/setter) a property or element access can run, as declarations. */
function accessorsOf(
    checker: ts.TypeChecker,
    n: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): ts.Declaration[] {
    const out: ts.Declaration[] = [];
    const named = ts.isPropertyAccessExpression(n)
        ? checker.getSymbolAtLocation(n.name)
        : ts.isStringLiteralLike(n.argumentExpression)
          ? checker.getSymbolAtLocation(n.argumentExpression)
          : undefined;
    const syms = named
        ? [named]
        : ts.isElementAccessExpression(n)
          ? checker.getPropertiesOfType(checker.getTypeAtLocation(n.expression))
          : [];
    for (const sym of syms)
        for (const d of sym.declarations ?? [])
            if ((ts.isGetAccessor(d) || ts.isSetAccessor(d)) && isProjectDecl(d)) out.push(d);
    return out;
}

function functionLikeOf(decl: ts.Node): ts.Node | undefined {
    if (
        ts.isFunctionDeclaration(decl) ||
        ts.isFunctionExpression(decl) ||
        ts.isArrowFunction(decl) ||
        ts.isMethodDeclaration(decl) ||
        ts.isGetAccessor(decl) ||
        ts.isSetAccessor(decl)
    )
        return decl;
    if (ts.isVariableDeclaration(decl) && decl.initializer) return decl.initializer;
    if (ts.isPropertyAssignment(decl)) return decl.initializer;
    return undefined;
}

/** Declarations a reference resolves to, following imports/aliases and `const g = realFn` value aliases. */
function resolveDeclarations(checker: ts.TypeChecker, ref: ts.Node, hops = 0): ts.Declaration[] {
    const target = ts.isPropertyAccessExpression(ref) ? ref.name : ref;
    let sym = checker.getSymbolAtLocation(target);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const out: ts.Declaration[] = [];
    for (const decl of sym?.declarations ?? []) {
        if (
            hops < 5 &&
            ts.isVariableDeclaration(decl) &&
            decl.initializer &&
            (ts.isIdentifier(decl.initializer) || ts.isPropertyAccessExpression(decl.initializer))
        ) {
            out.push(...resolveDeclarations(checker, decl.initializer, hops + 1));
        } else {
            out.push(decl);
        }
    }
    return out;
}

/** Function nodes behind a declaration, following `const GET = handler` aliases. */
function functionLikesOf(checker: ts.TypeChecker, decl: ts.Node, hops = 0): ts.Node[] {
    if (
        hops < 5 &&
        ts.isVariableDeclaration(decl) &&
        decl.initializer &&
        (ts.isIdentifier(decl.initializer) || ts.isPropertyAccessExpression(decl.initializer))
    ) {
        return resolveDeclarations(checker, decl.initializer).flatMap((x) =>
            functionLikesOf(checker, x, hops + 1),
        );
    }
    const fn = functionLikeOf(decl);
    return fn ? [fn] : [];
}

type GuardState = "guarded" | "unguarded" | "limit";
type GuardFields = {
    guarded?: boolean;
    guardUnresolved?: true;
    entitlement?: Reach;
    credential?: Reach;
    cache?: Reach;
    resolver?: Reach;
};

/**
 * Whether a guard is reachable from `node`: a call that resolves (through the
 * type checker: imports, aliases, path aliases, value aliases) to a declaration
 * in GUARD_SYMBOLS, or a closed inline reject shape. The walk follows calls
 * into project functions, and functions passed to a call by reference or as a
 * literal callback (the callee runs them, e.g. withAuth(handler)); a function
 * that is only DEFINED inside the handler and never called or passed is not
 * executed and is skipped. Bounded by MAX_GUARD_DEPTH and a visited set; a
 * branch that hits the bound returns "limit" (never "guarded"). "guarded"
 * means a guard is reachable, NOT that every path passes through it.
 */
function guardState(
    checker: ts.TypeChecker,
    node: ts.Node,
    visited: Set<ts.Node>,
    depth: number,
    probe: Probe = GUARD_PROBE,
): GuardState {
    if (probe.inline(node)) return "guarded";
    if (depth >= MAX_GUARD_DEPTH) return "limit";
    let result: GuardState = "unguarded";
    const followFns = (fns: ts.Node[]) => {
        for (const fn of fns) {
            if (visited.has(fn)) continue;
            visited.add(fn);
            const inner = guardState(checker, fn, visited, depth + 1, probe);
            if (inner === "guarded") {
                result = "guarded";
                return;
            }
            if (inner === "limit") result = "limit";
        }
    };
    const markLimit = () => {
        if ((result as GuardState) !== "guarded") result = "limit";
    };
    // Dispatch and implicit execution the walk cannot resolve statically: a
    // proof of absence may not rest on them, so each gives limit.
    const strictChecks = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
            // A method of a class can be overridden by a subclass.
            for (const decl of resolveDeclarations(checker, n.expression)) {
                if (
                    ts.isMethodDeclaration(decl) &&
                    isProjectDecl(decl) &&
                    (ts.isClassLike(decl.parent) || ts.isInterfaceDeclaration(decl.parent)) &&
                    !decl.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)
                )
                    markLimit();
            }
            // A library call that receives a project object may run its hooks.
            const decls = resolveDeclarations(checker, n.expression);
            if (decls.length > 0 && decls.every((d) => isLibraryFile(d.getSourceFile()))) {
                for (const arg of n.arguments) {
                    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) continue;
                    if (mayRunProjectCode(checker, checker.getTypeAtLocation(arg))) markLimit();
                }
                if (
                    ts.isPropertyAccessExpression(n.expression) &&
                    mayRunProjectCode(checker, checker.getTypeAtLocation(n.expression.expression))
                )
                    markLimit();
            }
        }
        if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
            for (const acc of accessorsOf(checker, n)) {
                if (acc.parent && ts.isClassLike(acc.parent)) markLimit();
                followFns([acc]);
            }
        }
        const touched: ts.Expression[] = [];
        if (ts.isTemplateExpression(n))
            for (const sp of n.templateSpans) touched.push(sp.expression);
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken)
            touched.push(n.left, n.right);
        if (ts.isSpreadAssignment(n) || ts.isSpreadElement(n)) touched.push(n.expression);
        if (ts.isObjectBindingPattern(n) && n.parent && "initializer" in n.parent) {
            const init = (n.parent as ts.VariableDeclaration).initializer;
            if (init) touched.push(init);
        }
        if (ts.isForInStatement(n) || ts.isForOfStatement(n)) touched.push(n.expression);
        for (const e of touched)
            if (mayRunProjectCode(checker, checker.getTypeAtLocation(e))) markLimit();
    };
    const follow = (ref: ts.Node, requireConsumed: ts.CallExpression | null) => {
        // A proof of absence counts every call: an unawaited gate still runs.
        if (!probe.strict && requireConsumed && !isConsumed(requireConsumed)) return;
        for (const decl of resolveDeclarations(checker, ref)) {
            if (probe.isTarget(decl)) {
                result = "guarded";
                return;
            }
            const sourceFile = decl.getSourceFile();
            if (sourceFile.isDeclarationFile || sourceFile.fileName.includes("/node_modules/"))
                continue;
            followFns(functionLikesOf(checker, decl));
            if (result === "guarded") return;
        }
    };
    const visit = (n: ts.Node): boolean | void => {
        if (result === "guarded") return false;
        const isFn =
            ts.isFunctionDeclaration(n) ||
            ts.isFunctionExpression(n) ||
            ts.isArrowFunction(n) ||
            ts.isMethodDeclaration(n);
        if (isFn && n !== node) {
            const p = n.parent;
            // Executed when called, passed to a call, or handed back to the
            // caller (a wrapper returns the function that runs the guard).
            const executed =
                p &&
                ((ts.isCallExpression(p) &&
                    (p.expression === n || p.arguments.some((a) => a === n))) ||
                    ts.isReturnStatement(p) ||
                    (ts.isArrowFunction(p) && p.body === n));
            if (!executed) return false;
        }
        // `new C()` runs C's constructor; a tagged template calls its tag.
        const callee = ts.isCallExpression(n)
            ? n.expression
            : ts.isNewExpression(n)
              ? n.expression
              : ts.isTaggedTemplateExpression(n)
                ? n.tag
                : undefined;
        if (ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n)) {
            const cls = ts.isNewExpression(n) ? classOf(checker, n.expression) : undefined;
            if (cls) {
                const ctor = cls.members.find(ts.isConstructorDeclaration);
                if (ctor) followFns([ctor]);
                // A field initializer runs on construction and is not walked.
                if (
                    probe.strict &&
                    cls.members.some((m) => ts.isPropertyDeclaration(m) && m.initializer)
                )
                    markLimit();
            } else {
                follow(callee!, null);
                if (probe.strict && !callResolves(checker, callee!)) markLimit();
            }
        } else if (callee && probe.strict && !callResolves(checker, callee)) {
            markLimit();
        }
        if (probe.strict) strictChecks(n);
        // fn.call(...), fn.apply(...), fn.bind(...) run or return fn itself.
        if (
            ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            ["call", "apply", "bind"].includes(n.expression.name.text)
        )
            follow(n.expression.expression, null);
        if (ts.isCallExpression(n)) {
            // An export initializer that IS the call (GET = withAuth(handler)) builds the handler; no await applies.
            follow(n.expression, n === node ? null : n);
            for (const arg of n.arguments)
                if (ts.isIdentifier(arg) || ts.isPropertyAccessExpression(arg)) follow(arg, null);
        }
    };
    walkLive(node, visit);
    return result;
}

/**
 * A guard's own body must reject at its top level: an inline reject `if`, or a
 * top-level statement that awaits/returns a call to ANOTHER guard symbol, in
 * statements that can run (nothing after an earlier top-level return/throw).
 * A guard whose only reject sits in dead code, an uncalled nested function or a
 * conditional arm is hollow.
 */
function guardBodyRejects(checker: ts.TypeChecker, fn: ts.Node): boolean {
    const body = (fn as ts.FunctionLikeDeclaration).body;
    if (!body || !ts.isBlock(body)) return false;
    const callOf = (e: ts.Expression | undefined): ts.CallExpression | undefined => {
        let x = e;
        while (x && (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x))) x = x.expression;
        return x && ts.isCallExpression(x) ? x : undefined;
    };
    for (const s of body.statements) {
        if (isInlineRejectIf(s)) return true;
        const exprs: (ts.Expression | undefined)[] = [];
        if (ts.isExpressionStatement(s) || ts.isReturnStatement(s)) exprs.push(s.expression);
        if (ts.isVariableStatement(s))
            for (const v of s.declarationList.declarations) exprs.push(v.initializer);
        for (const e of exprs) {
            const call = callOf(e);
            if (!call) continue;
            const awaited =
                (e && ts.isAwaitExpression(e)) || ts.isReturnStatement(s) || isConsumed(call);
            if (!awaited) continue;
            const self = (fn as ts.NamedDeclaration).name?.getText();
            if (
                resolveDeclarations(checker, call.expression).some(
                    (decl) =>
                        isGuardDeclaration(decl) &&
                        (decl as ts.NamedDeclaration).name?.getText() !== self,
                )
            )
                return true;
        }
        if (isExit(s)) return false;
    }
    return false;
}

export function verifyGuardSymbols(rootArg: string): string[] {
    const root = resolve(rootArg);
    const files = [...new Set(GUARD_SYMBOLS.map((g) => join(root, g.file)))].filter((f) =>
        existsSync(f),
    );
    const bad: string[] = [];
    if (files.length === 0) return GUARD_SYMBOLS.map((g) => `${g.file}#${g.name}`);
    const program = buildProgram(root, files);
    const checker = program.getTypeChecker();
    for (const g of GUARD_SYMBOLS) {
        const sf = program.getSourceFile(join(root, g.file));
        const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
        const sym =
            moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((s) => s.name === g.name);
        const decl = sym?.declarations?.[0];
        const fn = decl && functionLikeOf(decl);
        if (!fn || !guardBodyRejects(checker, fn)) bad.push(`${g.file}#${g.name}`);
    }
    return bad;
}

/**
 * ENTITLEMENT_SYMBOLS entries that are no longer a top-level function, no
 * longer call what they must, or (for a rejecting gate) no longer throw on a
 * condition computed from those calls' results. A gate replaced by a plain
 * return, or by a throw that ignores the entitlement, is hollow.
 */
export function verifyEntitlementSymbols(rootArg: string): string[] {
    const root = resolve(rootArg);
    const bad: string[] = [];
    for (const g of ENTITLEMENT_SYMBOLS) {
        const file = join(root, g.file);
        const fn = existsSync(file)
            ? parseSource(file).statements.find(
                  (st): st is ts.FunctionDeclaration =>
                      ts.isFunctionDeclaration(st) && st.name?.text === g.name,
              )
            : undefined;
        if (!fn || !entitlementGateIsLive(fn, g)) bad.push(`${g.file}#${g.name}`);
    }
    return bad;
}

function calleeName(call: ts.CallExpression): string | undefined {
    const e = call.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
    return undefined;
}

const COMPARISONS = new Set([
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
]);

const isLiteralOperand = (e: ts.Expression): boolean =>
    ts.isStringLiteralLike(e) ||
    ts.isNumericLiteral(e) ||
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    e.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(e) && e.text === "undefined");

/** A property / element chain whose root identifier is in `roots`. */
function rootedIn(e: ts.Expression, roots: Set<string>): boolean {
    let x: ts.Expression = e;
    while (
        ts.isPropertyAccessExpression(x) ||
        ts.isNonNullExpression(x) ||
        ts.isParenthesizedExpression(x) ||
        (ts.isElementAccessExpression(x) && isLiteralOperand(x.argumentExpression))
    )
        x = x.expression;
    return ts.isIdentifier(x) && roots.has(x.text);
}

/**
 * A rejecting condition whose truth is decided only by derived values: `!`,
 * `&&`, `||`, comparisons with literals, and property chains rooted in a
 * derived identifier. Any call, or an identifier that is not derived, makes it
 * a condition the entitlement does not control (`Math.random() < 0 && x`).
 */
function conditionDecidedBy(e: ts.Expression, derived: Set<string>): boolean {
    if (ts.isParenthesizedExpression(e)) return conditionDecidedBy(e.expression, derived);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken)
        return conditionDecidedBy(e.operand, derived);
    if (ts.isBinaryExpression(e)) {
        const op = e.operatorToken.kind;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken)
            return conditionDecidedBy(e.left, derived) && conditionDecidedBy(e.right, derived);
        if (COMPARISONS.has(op)) {
            const side = (x: ts.Expression) => isLiteralOperand(x) || rootedIn(x, derived);
            return (
                side(e.left) &&
                side(e.right) &&
                (rootedIn(e.left, derived) || rootedIn(e.right, derived))
            );
        }
        return false;
    }
    return rootedIn(e, derived);
}

const callsIn = (n: ts.Node): ts.CallExpression[] => {
    const out: ts.CallExpression[] = [];
    const v = (x: ts.Node) => {
        if (ts.isCallExpression(x)) out.push(x);
        ts.forEachChild(x, v);
    };
    v(n);
    return out;
};

const identifiersIn = (n: ts.Node): string[] => {
    const out: string[] = [];
    const v = (x: ts.Node) => {
        if (ts.isIdentifier(x)) out.push(x.text);
        ts.forEachChild(x, v);
    };
    v(n);
    return out;
};

/**
 * A gate is live when its own top-level statements, in order, still do the
 * work: a delegating gate awaits (or returns) a call to the gate it delegates
 * to; a rejecting gate awaits a named call, derives values from its result,
 * and has a top-level `if` that throws, in the same block and outside any
 * `try`, on a condition decided only by those values. Nothing nested under
 * another condition or inside a `try` counts, and nothing after an earlier
 * unconditional exit.
 */
function entitlementGateIsLive(
    fn: ts.FunctionDeclaration,
    g: { calls: readonly string[]; rejects: boolean },
): boolean {
    const body = fn.body;
    if (!body) return false;
    const derived = new Set<string>();
    let delegates = false;
    let rejecting = false;
    const named = (c: ts.CallExpression) => {
        const name = calleeName(c);
        return name !== undefined && g.calls.includes(name);
    };
    const unwrap = (e: ts.Expression | undefined): ts.Expression | undefined => {
        let x = e;
        while (x && (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x))) x = x.expression;
        return x;
    };
    const calledTop = new Set<string>();
    for (const st of body.statements) {
        for (const c of callsIn(st)) {
            const n = calleeName(c);
            if (n) calledTop.add(n);
        }
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (!ts.isIdentifier(d.name) || !d.initializer) continue;
                const awaitedNamed =
                    ts.isAwaitExpression(d.initializer) &&
                    ((x) => !!x && ts.isCallExpression(x) && named(x))(unwrap(d.initializer));
                const fromDerived = identifiersIn(d.initializer).some((id) => derived.has(id));
                if (awaitedNamed || (fromDerived && callsIn(d.initializer).some(named)))
                    derived.add(d.name.text);
                else if (fromDerived && rootedIn(d.initializer, derived)) derived.add(d.name.text);
            }
        }
        if (ts.isExpressionStatement(st) || ts.isReturnStatement(st)) {
            const e = st.expression;
            const x = unwrap(e);
            if (
                e &&
                (ts.isReturnStatement(st) || ts.isAwaitExpression(e)) &&
                x &&
                ts.isCallExpression(x) &&
                named(x)
            )
                delegates = true;
        }
        if (
            ts.isIfStatement(st) &&
            constantCondition(st.expression) === undefined &&
            conditionDecidedBy(st.expression, derived) &&
            (ts.isThrowStatement(st.thenStatement) ||
                (ts.isBlock(st.thenStatement) &&
                    st.thenStatement.statements.some(ts.isThrowStatement)))
        )
            rejecting = true;
        if (isExit(st)) break;
    }
    if (!g.calls.every((c) => calledTop.has(c))) return false;
    return g.rejects ? rejecting && derived.size > 0 : delegates;
}

/** CACHE_SYMBOLS names that no longer resolve to a declaration inside their package ("module#name"). */
export function verifyCacheSymbols(rootArg: string): string[] {
    const root = resolve(rootArg);
    const options = compilerOptions(root);
    const bad: string[] = [];
    for (const c of CACHE_SYMBOLS) {
        const resolved = ts.resolveModuleName(
            c.module,
            join(root, "src/__cache_probe__.ts"),
            options,
            ts.sys,
        ).resolvedModule?.resolvedFileName;
        let found = new Set<string>();
        if (resolved) {
            const program = buildProgram(root, [resolved]);
            const checker = program.getTypeChecker();
            const sf = program.getSourceFile(resolved);
            const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
            if (moduleSymbol)
                found = new Set(
                    checker
                        .getExportsOfModule(moduleSymbol)
                        .filter((sym) => {
                            const real =
                                sym.flags & ts.SymbolFlags.Alias
                                    ? checker.getAliasedSymbol(sym)
                                    : sym;
                            return (real.declarations ?? []).some((d) =>
                                c.pkgs.some((pk) =>
                                    d.getSourceFile().fileName.replace(/\\/g, "/").includes(pk),
                                ),
                            );
                        })
                        .map((sym) => sym.name),
                );
        }
        for (const name of c.names) if (!found.has(name)) bad.push(`${c.module}#${name}`);
    }
    return bad;
}

/** RESOLVER_SYMBOLS entries that are no longer a top-level function or const ("file#name"). */
export function verifyResolverSymbols(rootArg: string): string[] {
    const root = resolve(rootArg);
    const bad: string[] = [];
    for (const g of RESOLVER_SYMBOLS) {
        const file = join(root, g.file);
        const declared =
            existsSync(file) &&
            parseSource(file).statements.some(
                (st) =>
                    (ts.isFunctionDeclaration(st) && st.name?.text === g.name) ||
                    (ts.isVariableStatement(st) &&
                        st.declarationList.declarations.some(
                            (d) =>
                                (ts.isIdentifier(d.name) && d.name.text === g.name) ||
                                (ts.isObjectBindingPattern(d.name) &&
                                    d.name.elements.some(
                                        (el) => ts.isIdentifier(el.name) && el.name.text === g.name,
                                    )),
                        )),
            );
        if (!declared) bad.push(`${g.file}#${g.name}`);
    }
    return bad;
}

function toGuardFields(state: GuardState): GuardFields {
    if (state === "guarded") return { guarded: true };
    if (state === "unguarded") return { guarded: false };
    return { guardUnresolved: true };
}

function toReach(state: GuardState): Reach {
    return state === "guarded" ? "reachable" : state === "unguarded" ? "not_reachable" : "limit";
}

function worst(states: GuardState[]): GuardState {
    return states.includes("guarded")
        ? "guarded"
        : states.includes("limit")
          ? "limit"
          : "unguarded";
}

/** Every call-walk verdict for the function(s) behind one surface. */
function walkFields(
    checker: ts.TypeChecker,
    fns: ts.Node[],
    kind: "route" | "action",
): GuardFields {
    const run = (probe?: Probe): GuardState =>
        worst(fns.map((fn) => guardState(checker, fn, new Set([fn]), 0, probe)));
    // A server action's declared parameters are request input naming a resource.
    const takesInput =
        kind === "action" &&
        fns.some((fn) => ((fn as ts.FunctionLikeDeclaration).parameters?.length ?? 0) > 0);
    return {
        ...toGuardFields(run()),
        entitlement: toReach(run(ENTITLEMENT_PROBE)),
        credential: toReach(run(CREDENTIAL_PROBE)),
        cache: toReach(run(CACHE_PROBE)),
        resolver: toReach(takesInput ? "guarded" : run(RESOLVER_PROBE)),
    };
}

/** Guard fields of one exported name of `file`; empty when it is not a resolvable function. */
function guardedExport(
    program: ts.Program,
    file: string,
    name: string,
    kind: "route" | "action",
): GuardFields {
    const sf = program.getSourceFile(file);
    if (!sf) return {};
    const checker = program.getTypeChecker();
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    if (!moduleSymbol) return {};
    let sym = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === name);
    if (!sym) return {};
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    for (const decl of sym.declarations ?? []) {
        const fns = functionLikesOf(checker, decl);
        if (fns.length > 0) return walkFields(checker, fns, kind);
    }
    return {};
}

/** Guard fields of the inline "use server" function that starts on `line` of `file`. */
function guardedInline(program: ts.Program, file: string, pos: number): GuardFields {
    const sf = program.getSourceFile(file);
    if (!sf) return {};
    const checker = program.getTypeChecker();
    let result: GuardFields = {};
    let done = false;
    const visit = (node: ts.Node) => {
        if (done) return;
        const body = functionBody(node);
        if (body && hasUseServerDirective(body.statements) && node.getStart(sf) === pos) {
            result = walkFields(checker, [node], "action");
            done = true;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return result;
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
        ...guardedExport(program, file, m, "route"),
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

export function discoverRoutes(rootArg: string): RouteRecord[] {
    const root = resolve(rootArg);
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
export function discoverServerActionFiles(rootArg: string): {
    files: ServerActionFile[];
    actions: ServerActionRecord[];
} {
    const root = resolve(rootArg);
    const files: ServerActionFile[] = [];
    const actions: ServerActionRecord[] = [];
    type Found = {
        file: string;
        relFile: string;
        fileLevel: boolean;
        sf: ts.SourceFile;
        inline: { name: string; line: number; pos: number }[];
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
        const inline: { name: string; line: number; pos: number }[] = [];
        const used = new Set<string>();
        const visit = (node: ts.Node) => {
            const body = functionBody(node);
            if (body && hasUseServerDirective(body.statements)) {
                const line = lineOf(sf, node);
                let name = inlineActionName(node) ?? `anonymous@L${line}`;
                if (used.has(name)) name = `${name}@L${line}`;
                used.add(name);
                inline.push({ name, line, pos: node.getStart(sf) });
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
        if (inline.length > 0) found.push({ file, relFile, fileLevel: false, sf, inline });
    }
    const program =
        found.length > 0
            ? buildProgram(
                  root,
                  found.map((f) => f.file),
              )
            : null;
    for (const f of found) {
        let names: ({ name: string; line: number } & GuardFields)[];
        if (f.fileLevel && program) {
            const own = exportedNames(f.sf);
            const wildcardLine = own.find((n) => n.wildcard)?.line ?? 1;
            const lineByName = new Map<string, number>();
            for (const n of own) if (!lineByName.has(n.name)) lineByName.set(n.name, n.line);
            const { names: exported, unresolvedWildcard } = checkerExports(program, f.file);
            names = exported.map((name) => ({
                name,
                line: lineByName.get(name) ?? wildcardLine,
                ...guardedExport(program, f.file, name, "action"),
            }));
            // An unresolvable `export *` could export actions: demand a row.
            if (unresolvedWildcard) names.push({ name: "*", line: wildcardLine });
        } else {
            names = f.inline.map((n) => ({
                ...n,
                ...(program ? guardedInline(program, f.file, n.pos) : {}),
            }));
        }
        if (names.length === 0) continue;
        for (const n of names) {
            actions.push({
                id: `server_action:${f.relFile}#${n.name}`,
                file: f.relFile,
                exportName: n.name,
                line: n.line,
                guarded: n.guarded,
                guardUnresolved: n.guardUnresolved,
                entitlement: n.entitlement,
                credential: n.credential,
                cache: n.cache,
                resolver: n.resolver,
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
