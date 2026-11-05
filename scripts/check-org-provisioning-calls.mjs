/**
 * Release gate for the org and member admin UI (CHAOS-10881 PR-C).
 *
 * Web may change org, membership and user state only through the go-api admin routes that the
 * provisioning proxy fronts, and only from the files named in ci/org_provisioning_allowlist.txt.
 * The check is static and fails closed: no `src` dir is a failure, never a pass.
 *
 * It reads the TypeScript syntax tree of every .ts .tsx .js .jsx .mjs .cjs .mts .cts file under
 * `src` (test files and __tests__ skipped). It never matches source text, so comments, escapes and
 * wrappers (parentheses, `as`, `satisfies`, `<T>`, `!`) cannot hide or fake a finding.
 *
 * Findings (each printed as `FAIL <file>:<line> <key>`):
 * - a call to `request(` / `selfRequest(` (identifier or property access) whose path is a static
 *   string and whose method is POST/PATCH/PUT/DELETE, or is not a literal (key `UNKNOWN /path`),
 *   when the file has no row for that `METHOD /path` key;
 * - a call or `new` whose path is a static string under /api/v1/admin, /api/v1/orgs (the root and
 *   every subpath) or /api/v1/auth/accept-invite, with such a method, and no row for that file;
 * - an `/orgs/<id>/(members|transfer-ownership|invites)` string outside src/lib/admin/api/orgs.ts;
 * - an exported `createUser` (ES export in any form, or a CommonJS export);
 * - a call to `adminApi.users.create` from a file with no `call adminApi.users.create` row.
 * A row that no longer matches any site fails as stale ("remove it"), so the list only shrinks.
 *
 * A static string is a string literal, a template literal or a `+` chain of them, read after
 * escapes are decoded; each non-literal part reads as `{}`.
 * Limit: a path held in a variable or built by a function call is not seen.
 *
 * Allowlist row: `<key><TAB><file><TAB><reason>`; `#` starts a comment line.
 * Usage: node scripts/check-org-provisioning-calls.mjs [--root .] [--allowlist ci/org_provisioning_allowlist.txt]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const CLIENT_FILE = "src/lib/admin/api/orgs.ts";
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const CLIENT_CALLEES = new Set(["request", "selfRequest"]);
const CALLEES = new Set(["request", "selfRequest", "fetch"]);
const MEMBER_SEGMENTS = new Set(["members", "transfer-ownership", "invites"]);
const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/u;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/u;
const SCRIPT_KINDS = {
    tsx: ts.ScriptKind.TSX,
    jsx: ts.ScriptKind.JSX,
    js: ts.ScriptKind.JS,
    mjs: ts.ScriptKind.JS,
    cjs: ts.ScriptKind.JS,
};
const HOLE = "{}";

export function normalizePath(text) {
    return text.replace(/[?#].*$/u, "").replace(/\/$/u, "");
}

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "node_modules") continue;
            walk(full, out);
        } else if (SOURCE.test(entry.name) && !TEST_FILE.test(entry.name)) {
            out.push(full);
        }
    }
}

const hasModifier = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;

const unwrap = (node) => {
    let at = node;
    while (
        at &&
        (ts.isParenthesizedExpression(at) ||
            ts.isAsExpression(at) ||
            ts.isSatisfiesExpression(at) ||
            ts.isTypeAssertionExpression(at) ||
            ts.isNonNullExpression(at))
    )
        at = at.expression;
    return at;
};

const isLiteral = (node) =>
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node);
const isConcat = (node) =>
    ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

// The decoded text of a string expression with HOLE for every part that is not a literal; null
// when the expression holds no literal at all.
function textOf(expr) {
    const node = unwrap(expr);
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node))
        return node.templateSpans.reduce(
            (acc, span) => acc + HOLE + span.literal.text,
            node.head.text,
        );
    if (isConcat(node)) {
        const left = textOf(node.left);
        const right = textOf(node.right);
        return left === null && right === null ? null : (left ?? HOLE) + (right ?? HOLE);
    }
    return null;
}

// Every outermost string expression inside one argument, not looking into nested calls or
// functions (a nested call owns its own arguments).
function stringParts(node, out) {
    const at = unwrap(node);
    if (!at) return;
    if (isLiteral(at) || isConcat(at)) {
        const text = textOf(at);
        if (text !== null) {
            out.push({ node: at, text });
            return;
        }
    }
    if (
        ts.isCallExpression(at) ||
        ts.isNewExpression(at) ||
        ts.isFunctionLike(at) ||
        ts.isClassLike(at)
    )
        return;
    ts.forEachChild(at, (child) => stringParts(child, out));
}

const propertyName = (name) => {
    if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name)
    )
        return name.text;
    if (ts.isComputedPropertyName(name)) {
        const inner = unwrap(name.expression);
        return inner && (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner))
            ? inner.text
            : null;
    }
    return ts.isNumericLiteral(name) ? name.text : null;
};

const staticString = (node) =>
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    (ts.isTemplateExpression(node) && node.templateSpans.length === 0)
        ? node.text
        : null;

// The method after an options expression is applied over `current`: a method name, or "UNKNOWN"
// when a literal method cannot be read. Spreads of object literals are read; `a && {..}` and
// `a ? {..} : {..}` merge their branches; anything else may hold a method.
function methodFrom(expr, current) {
    const node = unwrap(expr);
    if (!node) return current;
    if (ts.isIdentifier(node) && node.text === "undefined") return current;
    if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
        return current;
    const merge = (a, b) => (a === b ? a : "UNKNOWN");
    if (ts.isConditionalExpression(node))
        return merge(methodFrom(node.whenTrue, current), methodFrom(node.whenFalse, current));
    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    )
        return merge(current, methodFrom(node.right, current));
    if (!ts.isObjectLiteralExpression(node)) return "UNKNOWN";
    let method = current;
    for (const prop of node.properties) {
        if (ts.isSpreadAssignment(prop)) {
            method = methodFrom(prop.expression, method);
            continue;
        }
        if (!prop.name) continue;
        const name = propertyName(prop.name);
        if (name !== null && name !== "method") continue;
        if (name === null || !ts.isPropertyAssignment(prop)) {
            method = "UNKNOWN";
            continue;
        }
        const value = staticString(unwrap(prop.initializer));
        method = value === null ? "UNKNOWN" : value.toUpperCase();
    }
    return method;
}

// The HTTP method of a call, read from its options object (2nd argument); "GET" when there is none.
const methodOf = (call) => methodFrom(call.arguments?.[1], "GET");

const bare = (segment) => (segment ?? "").replace(/\{\}$/u, "");
const cut = (text) => text.replace(/[?#].*$/u, "");

// Routes under the go-api admin namespaces named in a path text, as normalized keys.
function rawRoutes(text) {
    const routes = [];
    const prefix = "/api/v1";
    for (let at = text.indexOf(`${prefix}/`); at >= 0; at = text.indexOf(`${prefix}/`, at + 1)) {
        const rest = cut(text.slice(at + prefix.length));
        const segments = rest.split("/").slice(1);
        const first = bare(segments[0]);
        if (first === "admin" || first === "orgs") routes.push(normalizePath(rest));
        else if (first === "auth" && bare(segments[1]) === "accept-invite")
            routes.push("/auth/accept-invite");
    }
    return routes;
}

// How many `/orgs/<id>/(members|transfer-ownership|invites)` routes a text names.
function memberRoutes(text) {
    let count = 0;
    for (let at = text.indexOf("/orgs/"); at >= 0; at = text.indexOf("/orgs/", at + 1)) {
        const segments = cut(text.slice(at + "/orgs/".length)).split("/");
        if (segments[0] && MEMBER_SEGMENTS.has(bare(segments[1]))) count += 1;
    }
    return count;
}

// The name chain of a callee, `adminApi.users.create` -> ["adminApi", "users", "create"].
function chainOf(expr) {
    let node = unwrap(expr);
    const names = [];
    while (node) {
        if (ts.isPropertyAccessExpression(node)) names.unshift(node.name.text);
        else if (ts.isElementAccessExpression(node)) {
            const key = unwrap(node.argumentExpression);
            if (!key || !(ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)))
                return null;
            names.unshift(key.text);
        } else if (ts.isIdentifier(node)) {
            names.unshift(node.text);
            return names;
        } else return null;
        node = unwrap(node.expression);
    }
    return null;
}

function calleeName(call) {
    let callee = unwrap(call.expression);
    while (
        callee &&
        ts.isBinaryExpression(callee) &&
        callee.operatorToken.kind === ts.SyntaxKind.CommaToken
    )
        callee = unwrap(callee.right);
    const chain = callee && chainOf(callee);
    return chain ? chain[chain.length - 1] : null;
}

const NAME = "createUser";
const isNameToken = (node) =>
    node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === NAME;

function bindingHasName(name) {
    if (ts.isIdentifier(name)) return name.text === NAME;
    return name.elements.some((el) => !ts.isOmittedExpression(el) && bindingHasName(el.name));
}

function objectHasName(object) {
    return object.properties.some((prop) =>
        ts.isShorthandPropertyAssignment(prop) || ts.isPropertyAssignment(prop)
            ? propertyName(prop.name) === NAME
            : false,
    );
}

function exportsValue(expr) {
    const node = unwrap(expr);
    if (!node) return false;
    if (ts.isIdentifier(node)) return node.text === NAME;
    return ts.isObjectLiteralExpression(node) && objectHasName(node);
}

function exportsCreateUser(node) {
    if (
        (ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node)) &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword)
    )
        return node.name?.text === NAME;
    if (ts.isVariableStatement(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword))
        return node.declarationList.declarations.some((d) => bindingHasName(d.name));
    if (ts.isExportAssignment(node)) return exportsValue(node.expression);
    if (ts.isExportDeclaration(node) && node.exportClause) {
        if (ts.isNamespaceExport(node.exportClause)) return isNameToken(node.exportClause.name);
        return node.exportClause.elements.some(
            (e) => isNameToken(e.name) || isNameToken(e.propertyName),
        );
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const chain = chainOf(node.left);
        if (!chain) return false;
        const key = chain.join(".");
        if (key === `exports.${NAME}` || key === `module.exports.${NAME}`) return true;
        return key === "module.exports" && exportsValue(node.right);
    }
    return false;
}

export function findSites(rel, text) {
    const sites = [];
    const sf = ts.createSourceFile(
        rel,
        text,
        ts.ScriptTarget.Latest,
        true,
        SCRIPT_KINDS[rel.slice(rel.lastIndexOf(".") + 1)] ?? ts.ScriptKind.TS,
    );
    const add = (node, key) =>
        sites.push({
            file: rel,
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            key,
        });
    const covered = new WeakSet();
    const cover = (node) => {
        const at = unwrap(node);
        if (!at) return;
        covered.add(at);
        if (isConcat(at)) {
            cover(at.left);
            cover(at.right);
        }
    };
    const visitCall = (node) => {
        const name = calleeName(node);
        const http = CALLEES.has(name) || (ts.isNewExpression(node) && name === "Request");
        const method = methodOf(node);
        const flagged = MUTATING.has(method) || (http && method === "UNKNOWN");
        const first = node.arguments?.[0];
        if (flagged && first) {
            if (CLIENT_CALLEES.has(name)) {
                const p = textOf(first);
                if (p !== null && !p.startsWith("/api/"))
                    add(node, `${method} ${normalizePath(p)}`);
            }
            const parts = [];
            stringParts(first, parts);
            for (const part of parts)
                for (const route of rawRoutes(part.text)) add(part.node, `${method} ${route}`);
        }
        if (
            ts.isCallExpression(node) &&
            chainOf(node.expression)?.join(".") === "adminApi.users.create"
        )
            add(node, "call adminApi.users.create");
    };
    const visit = (node) => {
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) visitCall(node);
        if (rel !== CLIENT_FILE && (isLiteral(node) || isConcat(node)) && !covered.has(node)) {
            const value = textOf(node);
            if (value !== null) {
                cover(node);
                for (let n = memberRoutes(value); n > 0; n -= 1) add(node, "member route literal");
            }
        }
        if (exportsCreateUser(node)) add(node, "export createUser");
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return sites.sort((x, y) => x.line - y.line);
}

export function parseAllowlist(text) {
    const rows = [];
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const [key, file] = line.split("\t").map((part) => part.trim());
        rows.push({ key, file });
    }
    return rows;
}

export function scan(root, allowlistText) {
    const srcDir = path.join(root, "src");
    if (!fs.existsSync(srcDir))
        return { failures: [`no src dir at ${root}: run from the repo root`] };
    const files = [];
    walk(srcDir, files);
    const rows = parseAllowlist(allowlistText);
    const used = new Set();
    const failures = [];
    for (const file of files.sort()) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        for (const site of findSites(rel, fs.readFileSync(file, "utf8"))) {
            const idx = rows.findIndex((row) => row.key === site.key && row.file === site.file);
            if (idx >= 0) used.add(idx);
            else failures.push(`FAIL ${site.file}:${site.line} ${site.key}`);
        }
    }
    rows.forEach((row, idx) => {
        if (!used.has(idx))
            failures.push(`FAIL stale allowlist row: ${row.key} ${row.file} (remove it)`);
    });
    return { failures };
}

function main() {
    const args = process.argv.slice(2);
    const arg = (name, fallback) => {
        const at = args.indexOf(name);
        return at >= 0 ? args[at + 1] : fallback;
    };
    const root = path.resolve(arg("--root", "."));
    const allowlist = path.resolve(root, arg("--allowlist", "ci/org_provisioning_allowlist.txt"));
    if (!fs.existsSync(allowlist)) {
        console.error(`FAIL no allowlist at ${allowlist}`);
        process.exit(1);
    }
    const { failures } = scan(root, fs.readFileSync(allowlist, "utf8"));
    if (failures.length > 0) {
        console.error(failures.join("\n"));
        console.error(`check:org-provisioning: ${failures.length} finding(s)`);
        process.exit(1);
    }
    console.log("check:org-provisioning: ok");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
