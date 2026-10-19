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
        for (const field of [
            "action",
            "resource_resolver",
            "current_state_cache_behavior",
            "disclosure_behavior",
        ]) {
            const v = gate(row({}, [field]), { entitlement: "reachable", credential: "reachable" });
            expect(
                v.map((x) => x.rule),
                field,
            ).toEqual(["absent_without_proof"]);
            expect(v[0].detail).toContain("no call-walk predicate");
        }
    });
});

describe("the call walk's verdicts", () => {
    function tree(files: Record<string, string>): string {
        const dir = mkdtempSync(join(tmpdir(), "web-reach-"));
        for (const [name, text] of Object.entries(files)) {
            mkdirSync(join(dir, name, ".."), { recursive: true });
            writeFileSync(join(dir, name), text);
        }
        return dir;
    }

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

    it("a library call is not unresolved and a dead branch is not walked", () => {
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
        expect(got).toEqual({ lib: "not_reachable", dead: "not_reachable" });
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

    function tree2(): string {
        return mkdtempSync(join(tmpdir(), "web-reach-empty-"));
    }
});
