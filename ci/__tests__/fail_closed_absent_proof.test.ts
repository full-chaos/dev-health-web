import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    runGate,
    type EndpointProfileDoc,
    type EndpointProfileRow,
    type GateInputs,
} from "../gate_web_auth_profiles";
import {
    discoverRoutes,
    discoverServerActionFiles,
    verifyCacheSymbols,
    verifyEntitlementSymbols,
    type Reach,
    type ServerActionRecord,
} from "../discover_web_routes";

vi.setConfig({ testTimeout: 60_000 });

function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "web-fc-"));
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, name, ".."), { recursive: true });
        writeFileSync(join(dir, name), text);
    }
    return dir;
}

// The class: a proof of absence (or of a live gate) must rest only on code the
// analyser fully understands. A form it does not recognise is unproven, never
// absent and never live.

describe("a hollow entitlement gate is never live", () => {
    const PAGER_FILE = "src/lib/admin/server/canonicalIncidentIngestion.ts";
    const PAGER_ID = `${PAGER_FILE}#requirePagerDutyCreationEntitlement`;
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

    const pager = (body: string) =>
        `export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n${body}\n}\n`;
    const GOOD = [
        "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
        "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }",
    ].join("\n");

    function bad(body: string): string[] {
        const dir = tree({ [PAGER_FILE]: pager(body), "src/lib/acr/ops.ts": ACR });
        try {
            return verifyEntitlementSymbols(dir);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it("accepts the faithful gate", () => {
        expect(bad(GOOD)).toEqual([]);
    });

    const hollow: Record<string, string> = {
        "a self comparison": [
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "    if (entitlement.data?.enabled !== entitlement.data?.enabled) { throw new Error('no'); }",
        ].join("\n"),
        "a derived value that is reassigned": [
            "    let entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "    entitlement = { data: { enabled: true } };",
            "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }",
        ].join("\n"),
        "a return in a finally": [
            "    try {",
            "        const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "        if (entitlement.data?.enabled !== true) { throw new Error('no'); }",
            "    } finally { return; }",
        ].join("\n"),
        "the same value in both polarities": [
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "    if (entitlement.data?.enabled && !entitlement.data?.enabled) { throw new Error('no'); }",
        ].join("\n"),
        "an unknown statement form before the check (switch)": [
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "    switch (1) { default: }",
            "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }",
        ].join("\n"),
        "an unknown statement form before the check (labeled block)": [
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();",
            "    out: { break out; }",
            "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }",
        ].join("\n"),
    };
    for (const [label, body] of Object.entries(hollow)) {
        it(`rejects ${label}`, () => {
            expect(bad(body), label).toEqual([PAGER_ID]);
        });
    }
});

const TSCONFIG = JSON.stringify({
    compilerOptions: {
        baseUrl: ".",
        paths: {
            "next/cache": ["node_modules/next/cache.d.ts"],
            "next/headers": ["node_modules/next/headers.d.ts"],
            react: ["node_modules/react/index.d.ts"],
        },
    },
});
const LIBS: Record<string, string> = {
    "tsconfig.json": TSCONFIG,
    "node_modules/next/cache.d.ts":
        "export function revalidatePath(p: string): void;\nexport function revalidateTag(t: string): void;\nexport function updateTag(t: string): void;\nexport function refresh(): void;\nexport function unstable_cache<T>(f: T): T;\n",
    "node_modules/next/headers.d.ts":
        "export function cookies(): Promise<{ get(n: string): string | undefined }>;\nexport function headers(): Promise<{ get(n: string): string | null }>;\nexport function draftMode(): Promise<{ isEnabled: boolean }>;\n",
    "node_modules/react/index.d.ts": "export function cache<T>(f: T): T;\n",
};

function actionReach(
    files: Record<string, string>,
    key: "cache" | "resolver" | "entitlement" | "credential",
): Record<string, Reach | undefined> {
    const dir = tree({ ...LIBS, ...files });
    try {
        const { actions } = discoverServerActionFiles(dir);
        return Object.fromEntries(actions.map((a) => [a.exportName, a[key]]));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const ACTIONS = (lines: string[]) => ['"use server";', ...lines, ""].join("\n");

describe("the cache walk fails closed", () => {
    it("never gives not_reachable for a cache directive it did not recognise", () => {
        const got = actionReach(
            {
                "src/app/a/actions.ts": ACTIONS([
                    "export async function viaAlias() { const f = fetch; await f('http://x', { cache: 'no-store' }); }",
                    "export async function viaVariable() { const o = { cache: 'no-store' as const }; await fetch('http://x', o); }",
                    "export async function viaSpread() { const o = { cache: 'no-store' as const }; await fetch('http://x', { ...o }); }",
                    "export async function viaRequest() { new Request('http://x', { cache: 'no-store' }); }",
                    "export async function viaHeaders() { const h = new Headers(); h.set('cache-' + 'control', 'no-store'); }",
                    "export async function viaGlobalThis() { await globalThis.fetch('http://x', { cache: 'no-store' }); }",
                    "export async function viaJsonInit() { return Response.json({ a: 1 }, { headers: { 'x': 'y' } }); }",
                    "export async function unknownLibrary() { return crypto.randomUUID(); }",
                ]),
            },
            "cache",
        );
        for (const [name, verdict] of Object.entries(got))
            expect(verdict, name).not.toBe("not_reachable");
        expect(got.unknownLibrary).toBe("limit");
    });

    it("still proves absence for code it fully understands", () => {
        const got = actionReach(
            {
                "src/app/a/actions.ts": ACTIONS([
                    "export async function plain() { return 1 + 1; }",
                    "export async function builtins() { return JSON.stringify({ a: [1, 2] }) + String(Math.max(1, 2)) + new Date(0).getTime(); }",
                    "export async function logs() { console.log('x'); }",
                    "export async function bodyOnly() { return Response.json({ status: 'ok', ts: Date.now() }); }",
                    "export async function bodyStatus() { return Response.json({ a: 1 }, { status: 200 }); }",
                    "export async function urlOnly() { return new URL('http://x/y').pathname; }",
                ]),
            },
            "cache",
        );
        expect(got).toEqual({
            plain: "not_reachable",
            builtins: "not_reachable",
            logs: "not_reachable",
            bodyOnly: "not_reachable",
            bodyStatus: "not_reachable",
            urlOnly: "not_reachable",
        });
    });

    it("a re-exported cache function is reachable and a renamed public export is reported", () => {
        const reexport = {
            "node_modules/next/cache.d.ts":
                "declare function revalidatePathImpl(p: string): void;\nexport { revalidatePathImpl as revalidatePath };\nexport function revalidateTag(t: string): void;\nexport function updateTag(t: string): void;\nexport function refresh(): void;\nexport function unstable_cache<T>(f: T): T;\n",
        };
        const got = actionReach(
            {
                ...reexport,
                "src/app/a/actions.ts": ACTIONS([
                    "import { revalidatePath } from 'next/cache';",
                    "export async function bust() { revalidatePath('/x'); }",
                ]),
            },
            "cache",
        );
        expect(got.bust).toBe("reachable");
        const dir = tree({ ...LIBS, ...reexport });
        try {
            expect(verifyCacheSymbols(dir)).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("the resolver walk fails closed", () => {
    function routeReach(files: Record<string, string>): Record<string, Reach | undefined> {
        const dir = tree({ ...LIBS, ...files });
        try {
            return Object.fromEntries(discoverRoutes(dir).map((r) => [r.route, r.resolver]));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it("reaches every way a route can read its request", () => {
        const got = routeReach({
            "src/app/api/array-buffer/route.ts":
                "export async function POST(req: Request) { return Response.json(await req.clone().arrayBuffer().then((b) => b.byteLength)); }\n",
            "src/app/api/body/route.ts":
                "export async function POST(req: Request) { return Response.json({ has: req.body !== null }); }\n",
            "src/app/api/headers/route.ts":
                "export async function GET(req: Request) { return Response.json({ v: req.headers.get('x') }); }\n",
            "src/app/api/url-destructure/route.ts":
                "export async function GET(req: Request) { const { searchParams } = new URL(req.url); return Response.json({ q: searchParams.get('q') }); }\n",
            "src/app/api/cookies/route.ts":
                "import { cookies } from 'next/headers';\nexport async function GET() { return Response.json({ c: (await cookies()).get('a') }); }\n",
            "src/app/api/next-headers/route.ts":
                "import { headers } from 'next/headers';\nexport async function GET() { return Response.json({ c: (await headers()).get('a') }); }\n",
        });
        for (const [route, verdict] of Object.entries(got))
            expect(verdict, route).toBe("reachable");
    });

    it("keeps a route that reads nothing not_reachable (the /health shape)", () => {
        const got = routeReach({
            "src/app/health/route.ts":
                "export function GET() { return Response.json({ status: 'ok', ts: Date.now() }); }\n",
            "src/app/api/none/route.ts":
                "export async function GET() { return new Response('ok'); }\n",
        });
        expect(got["/health"]).toBe("not_reachable");
        expect(got["/api/none"]).not.toBe("reachable");
    });

    it("an unknown library call is limit, never not_reachable", () => {
        const got = actionReach(
            {
                "src/app/a/actions.ts": ACTIONS([
                    "export async function unknownLibrary() { return crypto.randomUUID(); }",
                ]),
            },
            "resolver",
        );
        // (an action with no parameter that calls an unknown library form)
        expect(got.unknownLibrary).toBe("limit");
    });
});

describe("empty-looking values are absent", () => {
    const ID = "server_action:fixture/actions.ts#doThing";
    function violations(field: string, value: unknown, reach: Partial<ServerActionRecord>) {
        const row: EndpointProfileRow = {
            id: ID,
            surface_kind: "server_action",
            method: null,
            route: null,
            service: "dev-health-web",
            source: { file: "fixture/actions.ts", line: 5 },
            classification: "protected",
            public_rationale: null,
            accepted_credential_classes: ["auth_js_browser_session"],
            primary_validator: {
                description: "getSessionContext() rejects on no session.",
                anchor: { path: "fixture/actions.ts", line: 2, line_end: 2 },
            },
            action: "a",
            resource_resolver: "r",
            current_state_cache_behavior: "c",
            disclosure_behavior: "d",
            token_shape: { token_type: "auth_js_browser_session" },
            entitlement_requirement: "f",
            gaps: [],
            [field]: value,
        };
        const doc: EndpointProfileDoc = {
            schema_version: "endpoint-profile.v1",
            generated_at: "2026-09-01T00:00:00Z",
            source_commit: "0000000000000000000000000000000000000000",
            rows: [row],
        };
        const inputs: GateInputs = {
            discoveredRoutes: [],
            discoveredActions: [
                { id: ID, file: "fixture/actions.ts", exportName: "doThing", line: 5, ...reach },
            ],
            doc,
            credentialClasses: ["auth_js_browser_session"],
            serviceVocabulary: ["dev-health-web"],
            schemaDocument: null,
            credentialClassesDocument: null,
            credentialClassesSchemaDocument: null,
            readSource: () => "    await getSessionContext();\n",
        };
        return runGate(inputs).filter((v) => v.rule === "absent_without_proof");
    }

    for (const value of [[null], { note: "" }, [[]], { a: { b: [] } }, ["", " "]]) {
        it(`${JSON.stringify(value)} needs the proof`, () => {
            for (const field of [
                "entitlement_requirement",
                "current_state_cache_behavior",
                "resource_resolver",
            ])
                expect(
                    violations(field, value, {
                        entitlement: "limit",
                        cache: "limit",
                        resolver: "limit",
                    }).length,
                    field,
                ).toBe(1);
            expect(
                violations("entitlement_requirement", value, { entitlement: "not_reachable" }),
            ).toEqual([]);
        });
    }

    it("a value with content is not empty", () => {
        expect(
            violations("resource_resolver", { note: "from session" }, { resolver: "limit" }),
        ).toEqual([]);
    });
});
