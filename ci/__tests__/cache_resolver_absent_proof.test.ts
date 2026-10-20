import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
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
    type Reach,
    type ServerActionRecord,
} from "../discover_web_routes";

const WEB_ROOT = resolve(__dirname, "../..");

vi.setConfig({ testTimeout: 60_000 });

const ID = "server_action:fixture/actions.ts#doThing";

const FIELDS = [
    { field: "current_state_cache_behavior", key: "cache" },
    { field: "resource_resolver", key: "resolver" },
] as const;

function row(overrides: Record<string, unknown>, remove: string[] = []): EndpointProfileRow {
    const r: EndpointProfileRow = {
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
        action: "fixture action",
        resource_resolver: "fixture resolver",
        current_state_cache_behavior: "fixture cache",
        disclosure_behavior: "fixture disclosure",
        token_shape: { token_type: "auth_js_browser_session" },
        entitlement_requirement: "some_feature",
        gaps: [],
        ...overrides,
    };
    for (const k of remove) delete r[k];
    return r;
}

function gate(
    r: EndpointProfileRow,
    reach: Partial<Pick<ServerActionRecord, "cache" | "resolver">>,
) {
    const doc: EndpointProfileDoc = {
        schema_version: "endpoint-profile.v1",
        generated_at: "2026-09-01T00:00:00Z",
        source_commit: "0000000000000000000000000000000000000000",
        rows: [r],
    };
    const actions: ServerActionRecord[] = [
        {
            id: ID,
            file: "fixture/actions.ts",
            exportName: "doThing",
            line: 5,
            entitlement: "limit",
            credential: "limit",
            ...reach,
        },
    ];
    const inputs: GateInputs = {
        discoveredRoutes: [],
        discoveredActions: actions,
        doc,
        credentialClasses: ["auth_js_browser_session"],
        serviceVocabulary: ["dev-health-web"],
        schemaDocument: null,
        credentialClassesDocument: null,
        credentialClassesSchemaDocument: null,
        readSource: () => "    await getSessionContext();\n",
    };
    return runGate(inputs).filter(
        (v) => v.rule === "absent_without_proof" || v.rule === "reach_contradicts_row",
    );
}

describe("cache and resolver: absent needs a call-walk proof", () => {
    for (const { field, key } of FIELDS) {
        const reach = (v: Reach | undefined) => (v ? { [key]: v } : {});

        it(`${field}: absent with no verdict, limit or reachable is rejected`, () => {
            for (const verdict of [undefined, "limit", "reachable"] as const) {
                const v = gate(row({}, [field]), reach(verdict));
                expect(
                    v.map((x) => x.rule),
                    `${verdict}`,
                ).toEqual(["absent_without_proof"]);
                expect(v[0].detail).toContain(field);
            }
        });

        it(`${field}: absent with a not_reachable verdict is accepted`, () => {
            expect(gate(row({}, [field]), reach("not_reachable"))).toEqual([]);
        });

        it(`${field}: an empty value counts as absent`, () => {
            for (const empty of ["", "  ", [], {}]) {
                expect(
                    gate(row({ [field]: empty }), reach("limit")).map((x) => x.rule),
                    JSON.stringify(empty),
                ).toEqual(["absent_without_proof"]);
                expect(gate(row({ [field]: empty }), reach("not_reachable"))).toEqual([]);
            }
        });

        it(`${field}: null with a gaps entry stays allowed whatever the verdict`, () => {
            const r = row({
                [field]: null,
                gaps: [`${field}: searched, not determined.`],
            });
            for (const verdict of ["reachable", "limit", "not_reachable"] as const)
                expect(gate(r, reach(verdict)), verdict).toEqual([]);
        });

        it(`${field}: a recorded value stays allowed whatever the verdict`, () => {
            for (const verdict of ["reachable", "limit", "not_reachable"] as const)
                expect(gate(row({}), reach(verdict)), verdict).toEqual([]);
        });
    }
});

const NEXT_CACHE =
    "export function revalidatePath(p: string): void;\nexport function revalidateTag(t: string): void;\nexport function updateTag(t: string): void;\nexport function refresh(): void;\nexport function unstable_cache<T>(f: T): T;\n";
const REACT = "export function cache<T>(f: T): T;\n";
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
const LIBS = {
    "tsconfig.json": TSCONFIG,
    "node_modules/next/cache.d.ts": NEXT_CACHE,
    "node_modules/react/index.d.ts": REACT,
    "node_modules/next/headers.d.ts":
        "export function cookies(): Promise<{ get(n: string): string | undefined }>;\nexport function headers(): Promise<{ get(n: string): string | null }>;\nexport function draftMode(): Promise<{ isEnabled: boolean }>;\n",
};

function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "web-cr-"));
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, name, ".."), { recursive: true });
        writeFileSync(join(dir, name), text);
    }
    return dir;
}

function actionReach(
    files: Record<string, string>,
    key: "cache" | "resolver",
): Record<string, Reach | undefined> {
    const dir = tree(files);
    try {
        const { actions } = discoverServerActionFiles(dir);
        return Object.fromEntries(actions.map((a) => [a.exportName, a[key]]));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe("the cache walk", () => {
    it("reaches a next/cache or react cache symbol, a fetch cache option, a Cache-Control string", () => {
        const got = actionReach(
            {
                ...LIBS,
                "src/lib/helper.ts":
                    'import { revalidatePath } from "next/cache";\nexport function bust() { revalidatePath("/x"); }\n',
                "src/app/a/actions.ts": [
                    '"use server";',
                    'import { bust } from "../../lib/helper";',
                    'import { revalidateTag, unstable_cache } from "next/cache";',
                    'import { cache } from "react";',
                    "export async function viaHelper() { bust(); }",
                    "export async function viaTag() { revalidateTag('t'); }",
                    "export async function viaUnstable() { await unstable_cache(async () => 1)(); }",
                    "export async function viaReact() { await cache(async () => 1)(); }",
                    "export async function viaFetchCache() { await fetch('http://x', { cache: 'no-store' }); }",
                    "export async function viaFetchNext() { await fetch('http://x', { next: { revalidate: 5 } }); }",
                    "export async function viaHeader() { return new Response('x', { headers: { 'Cache-Control': 'no-store' } }); }",
                    "export async function plain() { return 1 + 1; }",
                    "export async function plainFetch() { await fetch('http://x', { method: 'GET' }); }",
                    "",
                ].join("\n"),
            },
            "cache",
        );
        expect(got).toEqual({
            viaHelper: "reachable",
            viaTag: "reachable",
            viaUnstable: "reachable",
            viaReact: "reachable",
            viaFetchCache: "reachable",
            viaFetchNext: "reachable",
            viaHeader: "reachable",
            plain: "not_reachable",
            plainFetch: "limit",
        });
    });

    it("a hazard the walk cannot resolve never gives not_reachable", () => {
        const got = actionReach(
            {
                ...LIBS,
                "src/lib/types.ts": [
                    'import { revalidatePath } from "next/cache";',
                    "export class Base { async run() { return 1; } }",
                    "export class Sub extends Base { async run() { revalidatePath('/x'); return 2; } }",
                    "export class WithGetter { get value() { revalidatePath('/x'); return 1; } }",
                    "export const hook = { toJSON() { revalidatePath('/x'); return 1; } };",
                    "",
                ].join("\n"),
                "src/app/a/actions.ts": [
                    '"use server";',
                    'import { Base, Sub, WithGetter, hook } from "../../lib/types";',
                    "export async function virt() { const b: Base = new Sub(); await b.run(); }",
                    "export async function getter() { return new WithGetter().value; }",
                    "export async function toJson() { return JSON.stringify(hook); }",
                    "",
                ].join("\n"),
            },
            "cache",
        );
        for (const name of ["virt", "getter", "toJson"])
            expect(got[name], name).not.toBe("not_reachable");
    });

    it("verifyCacheSymbols reports a name that no longer resolves", () => {
        expect(verifyCacheSymbols(WEB_ROOT)).toEqual([]);
        const ok = tree(LIBS);
        const renamed = tree({
            ...LIBS,
            "node_modules/next/cache.d.ts": NEXT_CACHE.replace(
                "revalidatePath",
                "revalidatePathV2",
            ),
        });
        try {
            expect(verifyCacheSymbols(ok)).toEqual([]);
            expect(verifyCacheSymbols(renamed)).toEqual(["next/cache#revalidatePath"]);
        } finally {
            rmSync(ok, { recursive: true, force: true });
            rmSync(renamed, { recursive: true, force: true });
        }
    });
});

describe("the resolver walk", () => {
    const SHARED =
        "export async function getSessionContext() { return { token: 't', orgId: 'o' }; }\n";

    it("an action with a parameter or a session helper reaches a resolver; a bare action does not", () => {
        const got = actionReach(
            {
                "src/lib/admin/server/_shared.ts": SHARED,
                "src/lib/helper.ts":
                    'import { getSessionContext } from "./admin/server/_shared";\nexport async function who() { return getSessionContext(); }\n',
                "src/app/a/actions.ts": [
                    '"use server";',
                    'import { getSessionContext } from "../../lib/admin/server/_shared";',
                    'import { who } from "../../lib/helper";',
                    "export async function viaSession() { await getSessionContext(); }",
                    "export async function viaHelper() { await who(); }",
                    "export async function withParam(id: string) { return id.length; }",
                    "export async function bare() { return 1 + 1; }",
                    "",
                ].join("\n"),
            },
            "resolver",
        );
        expect(got).toEqual({
            viaSession: "reachable",
            viaHelper: "reachable",
            withParam: "reachable",
            bare: "not_reachable",
        });
    });

    it("a hazard the walk cannot resolve never gives not_reachable", () => {
        const got = actionReach(
            {
                "src/lib/admin/server/_shared.ts": SHARED,
                "src/lib/types.ts": [
                    'import { getSessionContext } from "./admin/server/_shared";',
                    "export class Base { async run() { return 1; } }",
                    "export class Sub extends Base { async run() { await getSessionContext(); return 2; } }",
                    "export const hook = { toJSON() { void getSessionContext(); return 1; } };",
                    "",
                ].join("\n"),
                "src/app/a/actions.ts": [
                    '"use server";',
                    'import { Base, Sub, hook } from "../../lib/types";',
                    "export async function virt() { const b: Base = new Sub(); await b.run(); }",
                    "export async function toJson() { return JSON.stringify(hook); }",
                    "",
                ].join("\n"),
            },
            "resolver",
        );
        for (const name of ["virt", "toJson"]) expect(got[name], name).not.toBe("not_reachable");
    });

    it("a route that reads the request body, query or params reaches a resolver; one that reads nothing does not", () => {
        const dir = tree({
            "src/app/api/body/route.ts":
                "export async function POST(req: Request) { return Response.json(await req.json()); }\n",
            "src/app/api/query/route.ts":
                "export async function GET(req: Request) { return new Response(new URL(req.url).searchParams.get('q')); }\n",
            "src/app/api/params/[id]/route.ts":
                "export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) { return new Response((await ctx.params).id); }\n",
            "src/app/api/none/route.ts":
                "export async function GET() { return new Response('ok'); }\n",
        });
        try {
            const got = Object.fromEntries(discoverRoutes(dir).map((r) => [r.route, r.resolver]));
            expect(got).toEqual({
                "/api/body": "reachable",
                "/api/query": "reachable",
                "/api/params/[id]": "reachable",
                "/api/none": "limit",
            });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
