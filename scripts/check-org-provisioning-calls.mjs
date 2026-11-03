/**
 * Release gate for the org and member admin UI (CHAOS-10881 PR-C).
 *
 * Web may change org, membership and user state only through the go-api admin routes that the
 * provisioning proxy fronts, and only from the files named in ci/org_provisioning_allowlist.txt.
 * The check is static and fails closed: no `src` dir is a failure, never a pass.
 *
 * Findings (each printed as `FAIL <file>:<line> <key>`):
 * - a mutating call (POST/PATCH/PUT/DELETE) to an identity route (/orgs..., /users...) made through
 *   the admin client (`request(` / `selfRequest(`) whose `METHOD /path` key has no row for that file;
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

export const CLIENT_FILE = "src/lib/admin/api/orgs.ts";
const MUTATING = "POST|PATCH|PUT|DELETE";
const METHOD_RE = new RegExp(`method:\\s*["'\`](${MUTATING})["'\`]`, "u");
const CLIENT_CALL = /\b(?:selfRequest|request)\s*(?:<[^>()]*>)?\(\s*(`[^`]*`|"[^"]*"|'[^']*')/gu;
const RAW_PATH = /\/api\/v1(\/(?:admin|orgs)\/[A-Za-z0-9_\-/{}$.]*|\/auth\/accept-invite)/gu;
const MEMBER_LITERAL =
    /\/orgs\/(?:\$\{[^}]*\}|[^/"'`\s]+)\/(?:members|transfer-ownership|invites)/u;

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
        } else if (/\.(ts|tsx)$/u.test(entry.name) && !/\.test\.(ts|tsx)$/u.test(entry.name)) {
            out.push(full);
        }
    }
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function isComment(text, index) {
    const start = text.lastIndexOf("\n", index) + 1;
    return /^\s*(\/\/|\*|\/\*)/u.test(text.slice(start, index + 1));
}

// The method of the call that starts at `from`, looked up before the next call or 400 chars on.
function methodAfter(text, from, stop) {
    const end = Math.min(stop ?? text.length, from + 400);
    const hit = METHOD_RE.exec(text.slice(from, end));
    return hit ? hit[1] : null;
}

export function findSites(rel, text) {
    const sites = [];
    const add = (index, key) => sites.push({ file: rel, line: lineOf(text, index), key });
    for (const match of text.matchAll(CLIENT_CALL)) {
        const p = normalizePath(match[1]);
        if (!/^\/(orgs|users)(\/|$)/u.test(p)) continue;
        const next = text.indexOf("request", match.index + match[0].length);
        const method = methodAfter(
            text,
            match.index + match[0].length,
            next < 0 ? undefined : next,
        );
        if (method) add(match.index, `${method} ${p}`);
    }
    const raws = [...text.matchAll(RAW_PATH)];
    raws.forEach((match, i) => {
        if (isComment(text, match.index)) return;
        const next = raws[i + 1]?.index;
        const method = methodAfter(text, match.index, next);
        if (method) add(match.index, `${method} ${normalizePath(match[1])}`);
    });
    for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+createUser\b/gu)) {
        add(match.index, "export createUser");
    }
    for (const match of text.matchAll(/\badminApi\.users\.create\(/gu)) {
        add(match.index, "call adminApi.users.create");
    }
    if (rel !== CLIENT_FILE) {
        const hit = MEMBER_LITERAL.exec(text);
        if (hit && !isComment(text, hit.index)) add(hit.index, "member route literal");
    }
    return sites;
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
