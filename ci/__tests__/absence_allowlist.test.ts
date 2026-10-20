import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    discoverServerActionFiles,
    discoverRoutes,
    verifyEntitlementSymbols,
    type Reach,
} from "../discover_web_routes";

vi.setConfig({ testTimeout: 60_000 });

// "Absent" is sound only on an allowlist: a handler is provably inert only when
// it holds no call expression at all (except `new Error(...)` in a `throw`), no
// property read on a non-literal, and no operator on a non-primitive. Anything
// else is `limit`. Globals and dependencies can be patched, so no builtin is
// trusted.

function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "web-allow-"));
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, name, ".."), { recursive: true });
        writeFileSync(join(dir, name), text);
    }
    return dir;
}

const TSCONFIG = JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "next/cache": ["node_modules/next/cache.d.ts"] } },
});
const LIBS: Record<string, string> = {
    "tsconfig.json": TSCONFIG,
    "node_modules/next/cache.d.ts": "export function revalidatePath(p: string): void;\n",
};

type Key = "cache" | "resolver" | "entitlement" | "credential";
const KEYS: Key[] = ["cache", "resolver", "entitlement", "credential"];

function verdicts(files: Record<string, string>): Record<string, Record<Key, Reach | undefined>> {
    const dir = tree({ ...LIBS, ...files });
    try {
        const { actions } = discoverServerActionFiles(dir);
        return Object.fromEntries(
            actions.map((a) => [
                a.exportName,
                Object.fromEntries(KEYS.map((k) => [k, a[k]])) as Record<Key, Reach | undefined>,
            ]),
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const ACTIONS = (lines: string[]) => ['"use server";', ...lines, ""].join("\n");

describe("what the allowlist proves inert", () => {
    it("literals, const bindings, primitive operators, plain data, if/else and throw new Error", () => {
        const got = verdicts({
            "src/app/a/actions.ts": ACTIONS([
                "export async function literals() { return 1 + 2 * 3; }",
                "export async function consts() { const a = 'x'; const b = a + 'y'; return b; }",
                "export async function ifElse() { const n = 4; if (n > 3 && n < 9) { return 'in'; } else { return 'out'; } }",
                "export async function template() { const n = 4; return `v${n}`; }",
                "export async function plainData() { const k = 1; return { a: k, b: [1, 'two', true, null], c: { d: undefined } }; }",
                "export async function thrower() { const ok = false; if (!ok) { throw new Error('no ' + 1); } return 1; }",
                "export async function primitiveParam(n: number) { return n + 1; }",
                "export async function conditional() { return 1 > 0 ? 'a' : 'b'; }",
            ]),
        });
        for (const [name, v] of Object.entries(got)) {
            for (const k of KEYS) {
                if (name === "primitiveParam" && k === "resolver")
                    expect(v[k], `${name}.${k}`).toBe("reachable");
                else expect(v[k], `${name}.${k}`).toBe("not_reachable");
            }
        }
    });

    it("any call, property read on a non-literal, await or spread is limit", () => {
        const got = verdicts({
            "src/app/a/actions.ts": ACTIONS([
                "export async function mathCall() { return Math.max(1, 2); }",
                "export async function jsonCall() { return JSON.stringify({ a: 1 }); }",
                "export async function dateNow() { return Date.now(); }",
                "export async function strCall() { return String(1); }",
                "export async function respJson() { return Response.json({ a: 1 }, { status: 200 }); }",
                "export async function propRead() { return 'abc'.length; }",
                "export async function objRead() { const o = { a: 1 }; return o.a; }",
                "export async function awaited() { return await 1; }",
                "export async function spreadObj() { const o = { a: 1 }; return { ...o }; }",
                "export async function newThing() { return new Date(0); }",
                "export async function consoleCall() { console.log('x'); }",
            ]),
        });
        for (const [name, v] of Object.entries(got))
            for (const k of KEYS) expect(v[k], `${name}.${k}`).toBe("limit");
    });
});

describe("hooks the walk cannot see never give not_reachable", () => {
    it("a patched console, valueOf, an interface-typed getter and a Proxy trap", () => {
        const got = verdicts({
            "src/lib/patch.ts":
                "import { revalidatePath } from 'next/cache';\nconsole.log = () => revalidatePath('/x');\n",
            "src/lib/hooks.ts": [
                "import { revalidatePath } from 'next/cache';",
                "export const valued = { valueOf() { revalidatePath('/x'); return 1; } };",
                "export interface HasV { readonly v: number }",
                "export class Impl implements HasV { get v() { revalidatePath('/x'); return 1; } }",
                "export const proxied = new Proxy({} as { a: number }, { get() { revalidatePath('/x'); return 1; } });",
                "",
            ].join("\n"),
            "src/app/a/actions.ts": ACTIONS([
                "import { valued, Impl, proxied, type HasV } from '../../lib/hooks';",
                "import '../../lib/patch';",
                "export async function viaConsole() { console.log('x'); }",
                "export async function arithmetic() { return (valued as unknown as number) + 1; }",
                "export async function comparison() { return (valued as unknown as number) > 0; }",
                "export async function interfaceGetter() { const i: HasV = new Impl(); return i.v; }",
                "export async function proxyTrap() { return proxied.a; }",
            ]),
        });
        for (const [name, v] of Object.entries(got))
            expect(v.cache, name).not.toBe("not_reachable");
    });
});

describe("routes", () => {
    it("a route with no call is not_reachable; a route that calls anything is limit", () => {
        const dir = tree({
            ...LIBS,
            "src/app/health/route.ts": "export function GET() { return 'ok'; }\n",
            "src/app/api/json/route.ts":
                "export function GET() { return Response.json({ status: 'ok' }, { status: 200 }); }\n",
            "src/app/api/date/route.ts":
                "export function GET() { return new Date().toISOString(); }\n",
        });
        try {
            const got = Object.fromEntries(discoverRoutes(dir).map((r) => [r.route, r.cache]));
            expect(got).toEqual({
                "/health": "not_reachable",
                "/api/json": "limit",
                "/api/date": "limit",
            });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("a gate is live only in one closed shape", () => {
    const FILE = "src/lib/admin/server/canonicalIncidentIngestion.ts";
    const ACR = [
        "export async function requireAcrEntitlement(): Promise<void> {",
        "    const entitlement = await fetchBoundedJson({});",
        "    if (entitlement.status !== 200) { throw new Error('down'); }",
        "    const parsed = schema.safeParse(entitlement.value);",
        "    if (!parsed.success || !parsed.data.is_valid) { throw new Error('no'); }",
        "}",
        "export async function resolveOpsCredentialIssuanceAuthorization() { await requireAcrEntitlement(); return 1; }",
        "",
    ].join("\n");
    const pager = (cond: string) =>
        [
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {",
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            `    if (${cond}) { throw new Error('no'); }`,
            "}",
            "",
        ].join("\n");
    function bad(cond: string): string[] {
        const dir = tree({ [FILE]: pager(cond), "src/lib/acr/ops.ts": ACR });
        try {
            return verifyEntitlementSymbols(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
    const ID = `${FILE}#requirePagerDutyCreationEntitlement`;

    it("accepts the closed shapes", () => {
        for (const cond of [
            "entitlement.data?.enabled !== true",
            "!entitlement.data?.enabled",
            "!entitlement.a || entitlement.b !== 200",
            "entitlement.status == 500 || !entitlement.ok",
        ])
            expect(bad(cond), cond).toEqual([]);
    });

    it("rejects a condition that can never reject or leaves the shape", () => {
        for (const cond of [
            "entitlement.data?.enabled === true && entitlement.data?.enabled === false",
            "entitlement.a && entitlement.b",
            "!(entitlement.a || entitlement.b)",
            "entitlement.a",
            "entitlement.a !== entitlement.b",
            "entitlement.a !== entitlement.a",
            "entitlement.a || (entitlement.b && entitlement.c)",
        ])
            expect(bad(cond), cond).toEqual([ID]);
    });
});
