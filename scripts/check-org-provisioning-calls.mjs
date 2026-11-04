/**
 * Release gate for the org and member admin UI (CHAOS-10881 PR-C).
 *
 * Web may change org, membership and user state only through the go-api admin routes that the
 * provisioning proxy fronts, and only from the files named in ci/org_provisioning_allowlist.txt.
 * The check is static and fails closed: no `src` dir is a failure, never a pass.
 *
 * Findings (each printed as `FAIL <file>:<line> <key>`):
 * - a mutating call (POST/PATCH/PUT/DELETE) made through the admin client (`request(` /
 *   `selfRequest(`, in any src file) whose `METHOD /path` key has no row for that file;
 * - a raw mutating `fetch` to /api/v1/admin/*, /api/v1/orgs/* or accept-invite whose key has no row
 *   for that file (this covers POST /admin/users from a component);
 * - an `/orgs/<id>/(members|transfer-ownership|invites)` literal outside src/lib/admin/api/orgs.ts;
 * - an `export ... createUser` (the org-scoped user create that wrote a membership);
 * - a call to `adminApi.users.create(` from a file with no `call users.create` row.
 * A row that no longer matches any site fails as stale ("remove it"), so the list only shrinks.
 * Limit: it reads literals; a path built by concatenation from variables is not seen.
 *
 * Allowlist row: `<key><TAB><file><TAB><reason>`; `#` starts a comment line.
 * Usage: node scripts/check-org-provisioning-calls.mjs [--root .] [--allowlist ci/org_provisioning_allowlist.txt]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const CLIENT_FILE = "src/lib/admin/api/orgs.ts";
const MUTATING = "POST|PATCH|PUT|DELETE";
const RAW_PATH = /\/api\/v1(\/(?:admin|orgs)\/[A-Za-z0-9_\-/{}$.]*|\/auth\/accept-invite)/gu;
const MEMBER_LITERAL =
    /\/orgs\/(?:\$\{[^}]*\}|[^/"'`\s]+)\/(?:members|transfer-ownership|invites)/gu;
const SOURCE_EXT = "ts|tsx|js|jsx|mjs|cjs|mts|cts";
const SCRIPT_KINDS = {
    tsx: ts.ScriptKind.TSX,
    jsx: ts.ScriptKind.JSX,
    js: ts.ScriptKind.JS,
    mjs: ts.ScriptKind.JS,
    cjs: ts.ScriptKind.JS,
};

export function normalizePath(literal) {
    return literal
        .replace(/^[`"']|[`"']$/gu, "")
        .replace(/\$\{[^}]*\}/gu, "{}")
        .replace(/[?#].*$/u, "")
        .replace(/\/$/u, "");
}

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "node_modules") continue;
            walk(full, out);
        } else if (
            new RegExp(`\\.(?:${SOURCE_EXT})$`, "u").test(entry.name) &&
            !new RegExp(`\\.(?:test|spec)\\.(?:${SOURCE_EXT})$`, "u").test(entry.name)
        ) {
            out.push(full);
        }
    }
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

const hasModifier = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;
const literalText = (node) =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        ? node.text
        : null;

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

// Method of one call, read from its own options object (2nd argument) only.
function callMethod(call) {
    const options = unwrap(call.arguments[1]);
    if (!options || !ts.isObjectLiteralExpression(options)) return null;
    for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const name = ts.isIdentifier(prop.name) ? prop.name.text : literalText(prop.name);
        if (name !== "method") continue;
        const value = literalText(prop.initializer)?.toUpperCase();
        return value && MUTATING.split("|").includes(value) ? value : null;
    }
    return null;
}

// First path argument of a call as source text, `${...}` kept so normalizePath can fold it.
const pathArg = (call) => {
    const arg = call.arguments[0];
    if (!arg) return null;
    return ts.isStringLiteral(arg) ||
        ts.isNoSubstitutionTemplateLiteral(arg) ||
        ts.isTemplateExpression(arg)
        ? arg.getText()
        : null;
};

function exportsCreateUser(node) {
    if (ts.isFunctionDeclaration(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword))
        return node.name?.text === "createUser";
    if (ts.isVariableStatement(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword))
        return node.declarationList.declarations.some(
            (d) => ts.isIdentifier(d.name) && d.name.text === "createUser",
        );
    if (ts.isExportAssignment(node))
        return ts.isIdentifier(node.expression) && node.expression.text === "createUser";
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
        return node.exportClause.elements.some(
            (e) => e.name.text === "createUser" || e.propertyName?.text === "createUser",
        );
    return false;
}

// The call that holds `node` as (part of) one of its arguments.
function owningCall(node) {
    for (let at = node; at.parent; at = at.parent) {
        const up = at.parent;
        if (ts.isCallExpression(up) && up.arguments.includes(at)) return up;
        if (ts.isBlock(up) || ts.isSourceFile(up)) return null;
    }
    return null;
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
    const memberAt = new Set();
    const add = (index, key) => sites.push({ file: rel, line: lineOf(text, index), key });
    const visit = (node) => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            if (ts.isIdentifier(callee) && /^(?:selfRequest|request)$/u.test(callee.text)) {
                const arg = pathArg(node);
                const p = arg && normalizePath(arg);
                const method = callMethod(node);
                if (p && !p.startsWith("/api/") && method) add(node.getStart(sf), `${method} ${p}`);
            }
            if (
                ts.isPropertyAccessExpression(callee) &&
                callee.getText(sf) === "adminApi.users.create"
            )
                add(node.getStart(sf), "call adminApi.users.create");
        }
        if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateExpression(node)
        ) {
            const source = node.getText(sf);
            if (rel !== CLIENT_FILE)
                for (const match of source.matchAll(MEMBER_LITERAL)) {
                    const at = node.getStart(sf) + match.index;
                    if (memberAt.has(at)) continue;
                    memberAt.add(at);
                    add(at, "member route literal");
                }
            for (const match of source.matchAll(RAW_PATH)) {
                const call = owningCall(node);
                const method = call && callMethod(call);
                if (method)
                    add(node.getStart(sf) + match.index, `${method} ${normalizePath(match[1])}`);
            }
        }
        if (exportsCreateUser(node)) add(node.getStart(sf), "export createUser");
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
