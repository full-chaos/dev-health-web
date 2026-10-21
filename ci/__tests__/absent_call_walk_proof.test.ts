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
    ENTITLEMENT_SYMBOLS,
    discoverServerActionFiles,
    verifyEntitlementSymbols,
    type Reach,
    type ServerActionRecord,
} from "../discover_web_routes";

const WEB_ROOT = resolve(__dirname, "../..");

vi.setConfig({ testTimeout: 60_000 });

const ID = "server_action:fixture/actions.ts#doThing";

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

function gate(r: EndpointProfileRow, reach: { entitlement?: Reach; credential?: Reach }) {
    const doc: EndpointProfileDoc = {
        schema_version: "endpoint-profile.v1",
        generated_at: "2026-09-01T00:00:00Z",
        source_commit: "0000000000000000000000000000000000000000",
        rows: [r],
    };
    const actions: ServerActionRecord[] = [
        { id: ID, file: "fixture/actions.ts", exportName: "doThing", line: 5, ...reach },
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

function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "web-reach-"));
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, name, ".."), { recursive: true });
        writeFileSync(join(dir, name), text);
    }
    return dir;
}

describe("absent needs a call-walk proof", () => {
    it("rejects an absent entitlement_requirement with no verdict", () => {
        const v = gate(row({}, ["entitlement_requirement"]), {});
        expect(v.map((x) => x.rule)).toEqual(["absent_without_proof"]);
        expect(v[0].detail).toContain("entitlement_requirement");
    });

    it("rejects an absent entitlement_requirement when the walk hit its bound", () => {
        const v = gate(row({}, ["entitlement_requirement"]), { entitlement: "limit" });
        expect(v.map((x) => x.rule)).toEqual(["absent_without_proof"]);
    });

    it("accepts an absent entitlement_requirement when the walk proves not_reachable", () => {
        expect(
            gate(row({}, ["entitlement_requirement"]), { entitlement: "not_reachable" }),
        ).toEqual([]);
    });

    it("rejects an absent or null entitlement_requirement when a gate is reachable", () => {
        for (const r of [
            row({}, ["entitlement_requirement"]),
            row({
                entitlement_requirement: null,
                gaps: ["entitlement_requirement: searched, not determined."],
            }),
        ]) {
            const v = gate(r, { entitlement: "reachable" });
            expect(v.some((x) => x.rule === "reach_contradicts_row")).toBe(true);
        }
    });

    it("rejects a recorded entitlement_requirement when no gate is reachable", () => {
        const v = gate(row({ entitlement_requirement: "some_feature" }), {
            entitlement: "not_reachable",
        });
        expect(v.map((x) => x.rule)).toEqual(["reach_contradicts_row"]);
    });

    it("accepts a recorded entitlement_requirement when a gate is reachable or the walk is unresolved", () => {
        expect(gate(row({}), { entitlement: "reachable" })).toEqual([]);
        expect(gate(row({}), { entitlement: "limit" })).toEqual([]);
    });

    it("accepts null with a gaps entry when the walk is unresolved", () => {
        const r = row({
            entitlement_requirement: null,
            gaps: ["entitlement_requirement: searched, not determined."],
        });
        expect(gate(r, { entitlement: "limit" })).toEqual([]);
    });

    it("rejects an absent token_shape unless the credential walk is not_reachable", () => {
        expect(
            gate(row({}, ["token_shape"]), { credential: "reachable" }).map((x) => x.rule),
        ).toEqual(["absent_without_proof", "reach_contradicts_row"]);
        expect(gate(row({}, ["token_shape"]), { credential: "limit" }).map((x) => x.rule)).toEqual([
            "absent_without_proof",
        ]);
        expect(gate(row({}, ["token_shape"]), {})).not.toEqual([]);
        expect(gate(row({}, ["token_shape"]), { credential: "not_reachable" })).toEqual([]);
    });

    it("rejects a null token_shape when a credential read is reachable", () => {
        const r = row({
            token_shape: null,
            gaps: ["token_shape: searched, not determined."],
        });
        expect(gate(r, { credential: "reachable" }).map((x) => x.rule)).toEqual([
            "reach_contradicts_row",
        ]);
    });

    it("rejects absent on every advisory field that has no predicate", () => {
        for (const field of ["action", "disclosure_behavior"]) {
            const v = gate(row({}, [field]), { entitlement: "reachable", credential: "reachable" });
            expect(
                v.map((x) => x.rule),
                field,
            ).toEqual(["absent_without_proof"]);
            expect(v[0].detail).toContain("no call-walk predicate");
        }
    });
});

describe("a present but empty value is absent", () => {
    for (const empty of ["", "  ", [], {}]) {
        const label = JSON.stringify(empty);
        it(`${label} on entitlement_requirement, token_shape and action needs the proof`, () => {
            for (const field of ["entitlement_requirement", "token_shape", "action"]) {
                const v = gate(row({ [field]: empty }), {
                    entitlement: "limit",
                    credential: "limit",
                });
                expect(
                    v.some((x) => x.rule === "absent_without_proof" && x.detail.startsWith(field)),
                    field,
                ).toBe(true);
            }
        });

        it(`${label} is accepted as absent only on a not_reachable verdict`, () => {
            expect(
                gate(row({ entitlement_requirement: empty }), { entitlement: "not_reachable" }),
            ).toEqual([]);
        });
    }
});

describe("the call walk's verdicts", () => {
    const OPS =
        "export async function requireAcrEntitlement(): Promise<void> { throw new Error('no'); }\n";

    function reachOf(files: Record<string, string>): Record<string, Reach | undefined> {
        const dir = tree(files);
        try {
            const { actions } = discoverServerActionFiles(dir);
            return Object.fromEntries(actions.map((a) => [a.exportName, a.entitlement]));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it("reachable through a project helper, not_reachable when no gate is called, limit when a callee is unresolved", () => {
        const got = reachOf({
            "src/lib/acr/ops.ts": OPS,
            "src/lib/helper.ts":
                'import { requireAcrEntitlement } from "./acr/ops";\nexport async function gated() { await requireAcrEntitlement(); }\n',
            "src/app/a/actions.ts": [
                '"use server";',
                'import { gated } from "../../lib/helper";',
                "export async function viaHelper() { await gated(); }",
                "export async function plain() { return 1 + 1; }",
                "export async function viaParam(cb: () => Promise<void>) { await cb(); }",
                "",
            ].join("\n"),
        });
        expect(got).toEqual({
            viaHelper: "reachable",
            plain: "not_reachable",
            viaParam: "limit",
        });
    });

    it("a gate reached by new, a tagged template, .call or an unawaited call is reachable", () => {
        const got = reachOf({
            "src/lib/acr/ops.ts": OPS,
            "src/app/a/actions.ts": [
                '"use server";',
                'import { requireAcrEntitlement } from "../../lib/acr/ops";',
                "class Ctor { constructor() { void requireAcrEntitlement(); } }",
                "class Field { x = requireAcrEntitlement(); }",
                "export async function viaNew() { new Ctor(); }",
                "export async function viaField() { new Field(); }",
                "export async function viaBind() { await requireAcrEntitlement.call(undefined); }",
                "export async function viaTag() { const t = (s: TemplateStringsArray) => requireAcrEntitlement(); await t`x`; }",
                "export async function viaVoid() { void requireAcrEntitlement(); }",
                "",
            ].join("\n"),
        });
        expect(got).toEqual({
            viaNew: "reachable",
            viaField: "limit",
            viaBind: "reachable",
            viaTag: "reachable",
            viaVoid: "reachable",
        });
    });

    it("dispatch and implicit execution the walk cannot resolve never give not_reachable", () => {
        const got = reachOf({
            "src/lib/acr/ops.ts": OPS,
            "src/lib/types.ts": [
                'import { requireAcrEntitlement } from "./acr/ops";',
                "export class Base { async run() { return 1; } }",
                "export class Sub extends Base { async run() { await requireAcrEntitlement(); return 2; } }",
                "export class WithGetter { get value() { return requireAcrEntitlement(); } }",
                "export const objGetter = { get x() { return requireAcrEntitlement(); } };",
                "export const hook = { toJSON() { void requireAcrEntitlement(); return 1; } };",
                "export class Tostr { toString() { void requireAcrEntitlement(); return 'x'; } }",
                "",
            ].join("\n"),
            "src/app/a/actions.ts": [
                '"use server";',
                'import { Base, Sub, WithGetter, objGetter, hook, Tostr } from "../../lib/types";',
                "export async function virt() { const b: Base = new Sub(); await b.run(); }",
                "export async function classGetter() { await new WithGetter().value; }",
                "export async function objGet() { await objGetter.x; }",
                "export async function dynKey(k: 'x') { return objGetter[k]; }",
                "export async function toJson() { return JSON.stringify(hook); }",
                "export async function tpl() { return `${new Tostr()}`; }",
                "export async function plus() { return 'a' + new Tostr(); }",
                "export async function spread() { return { ...objGetter }; }",
                "export async function destr() { const { x } = objGetter; return x; }",
                "export async function forIn() { for (const k in objGetter) { void k; } }",
                "export async function plain() { return JSON.stringify({ a: 1, b: [1, 2] }) + String(3); }",
                "export async function plain2() { const m = new Map<string, number>(); m.set('a', 1); return [...m.keys()].length; }",
                "",
            ].join("\n"),
        });
        for (const name of [
            "virt",
            "classGetter",
            "objGet",
            "dynKey",
            "toJson",
            "tpl",
            "plus",
            "spread",
            "destr",
            "forIn",
        ])
            expect(got[name], name).not.toBe("not_reachable");
        expect(got.plain).toBe("limit");
        expect(got.plain2).toBe("limit");
    });

    it("a library call and a gate in a dead branch are both unproven (limit)", () => {
        const got = reachOf({
            "src/lib/acr/ops.ts": OPS,
            "src/app/a/actions.ts": [
                '"use server";',
                'import { requireAcrEntitlement } from "../../lib/acr/ops";',
                "export async function lib() { return JSON.stringify([1]).length; }",
                "export async function dead() { if (false) { await requireAcrEntitlement(); } return 1; }",
                "",
            ].join("\n"),
        });
        expect(got).toEqual({ lib: "limit", dead: "limit" });
    });
});

describe("ENTITLEMENT_SYMBOLS", () => {
    it("every entry is still a function that exits on a missing entitlement", () => {
        expect(ENTITLEMENT_SYMBOLS.length).toBeGreaterThan(0);
        expect(verifyEntitlementSymbols(WEB_ROOT)).toEqual([]);
    });

    it("reports an entry whose declaration is gone", () => {
        const dir = tree2();
        try {
            expect(verifyEntitlementSymbols(dir).length).toBe(ENTITLEMENT_SYMBOLS.length);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("rejects hollow gates: a plain return, a call that never rejects, a throw that ignores the result", () => {
        const variants: Record<string, Record<string, string>> = {
            "plain return": {
                "src/lib/admin/server/canonicalIncidentIngestion.ts":
                    "export async function requirePagerDutyCreationEntitlement() { return; }\n",
                "src/lib/acr/ops.ts":
                    "export async function requireAcrEntitlement() { return; }\nexport async function resolveOpsCredentialIssuanceAuthorization() { return 1; }\n",
            },
            "calls but never rejects": {
                "src/lib/admin/server/canonicalIncidentIngestion.ts":
                    "export async function requirePagerDutyCreationEntitlement() { await getCanonicalIncidentIngestionEntitlement(); }\n",
                "src/lib/acr/ops.ts":
                    "export async function requireAcrEntitlement() { const e = await fetchBoundedJson({}); e.x.safeParse(1); }\nexport async function resolveOpsCredentialIssuanceAuthorization() { await requireAcrEntitlement(); }\n",
            },
            "throws without looking at the result": {
                "src/lib/admin/server/canonicalIncidentIngestion.ts":
                    "export async function requirePagerDutyCreationEntitlement() { await getCanonicalIncidentIngestionEntitlement(); if (Math.random() > 2) { throw new Error('x'); } }\n",
                "src/lib/acr/ops.ts":
                    "export async function requireAcrEntitlement() { const e = await fetchBoundedJson({}); e.x.safeParse(1); if (flag()) { throw new Error('x'); } }\nexport async function resolveOpsCredentialIssuanceAuthorization() { await requireAcrEntitlement(); }\n",
            },
        };
        for (const [label, files] of Object.entries(variants)) {
            const dir = tree(files);
            try {
                const bad = verifyEntitlementSymbols(dir);
                const pager =
                    "src/lib/admin/server/canonicalIncidentIngestion.ts#requirePagerDutyCreationEntitlement";
                const acr = "src/lib/acr/ops.ts#requireAcrEntitlement";
                const resolve3 = "src/lib/acr/ops.ts#resolveOpsCredentialIssuanceAuthorization";
                expect(bad.sort(), label).toEqual(
                    (label === "plain return" ? [pager, acr, resolve3] : [pager, acr]).sort(),
                );
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    function tree2(): string {
        return mkdtempSync(join(tmpdir(), "web-reach-empty-"));
    }
});
