import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
    runGate,
    checkContractInputsPresent,
    type EndpointProfileDoc,
    type EndpointProfileRow,
    type GateInputs,
} from "../gate_web_auth_profiles";
import {
    discoverRoutes,
    discoverServerActionFiles,
    type RouteRecord,
    type ServerActionRecord,
} from "../discover_web_routes";

const WEB_ROOT = resolve(__dirname, "../..");

/**
 * A minimal, individually valid two-row baseline (one rest row, one
 * server_action row) plus matching discovery, so every seeded-violation test
 * below mutates exactly ONE thing away from a state the gate accepts. If the
 * baseline itself failed, every "seed X, expect X" test downstream would be
 * meaningless -- it is asserted clean first.
 */
function baseline(): {
    doc: EndpointProfileDoc;
    routes: RouteRecord[];
    actions: ServerActionRecord[];
    sources: Record<string, string>;
} {
    const restRow: EndpointProfileRow = {
        id: "GET /api/example [dev-health-web]",
        surface_kind: "rest",
        method: "GET",
        route: "/api/example",
        service: "dev-health-web",
        source: { file: "src/app/api/example/route.ts", line: 3 },
        classification: "protected",
        public_rationale: null,
        accepted_credential_classes: ["auth_js_browser_session"],
        primary_validator: {
            description: "getSessionContext() rejects on no session.",
            anchor: { path: "fixture/example_route.ts", line: 1, line_end: 1 },
        },
        gaps: [],
    };
    const actionRow: EndpointProfileRow = {
        id: "server_action:fixture/actions.ts#doThing",
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
        gaps: [],
    };
    const doc: EndpointProfileDoc = {
        schema_version: "endpoint-profile.v1",
        generated_at: "2026-09-01T00:00:00Z",
        source_commit: "0000000000000000000000000000000000000000",
        credential_class_source: "contracts/auth/v1/credential-classes.json",
        rows: [restRow, actionRow],
    };
    const routes: RouteRecord[] = [
        { method: "GET", route: "/api/example", file: "src/app/api/example/route.ts", line: 3 },
    ];
    const actions: ServerActionRecord[] = [
        {
            id: "server_action:fixture/actions.ts#doThing",
            file: "fixture/actions.ts",
            exportName: "doThing",
            line: 5,
        },
    ];
    const sources: Record<string, string> = {
        "fixture/example_route.ts": "    await getSessionContext();\n",
        "fixture/actions.ts":
            "export async function doThing() {\n    const { token } = await getSessionContext();\n    return token;\n}\n",
    };
    return { doc, routes, actions, sources };
}

function makeInputs(
    b: ReturnType<typeof baseline>,
    overrides: Partial<GateInputs> = {},
): GateInputs {
    return {
        discoveredRoutes: b.routes,
        discoveredActions: b.actions,
        doc: b.doc,
        credentialClasses: ["auth_js_browser_session", "ops_access_token_hs256"],
        // Mirrors endpoint-profile.schema.json's live $defs.endpointProfile
        // .properties.service.enum as of this pass; a real run reads it from
        // the schema (loadServiceVocabulary), never hardcodes it.
        serviceVocabulary: [
            "dev-health-ops-api",
            "dev-health-ops-billing-edge",
            "dev-health-web",
            "dev-health-acr-api",
            "dev-health-acr-mcp",
        ],
        readSource: (path, line, lineEnd) => {
            const text = b.sources[path];
            if (!text) return null;
            const lines = text.split("\n");
            return lines.slice(Math.max(0, line - 1), lineEnd).join("\n");
        },
        ...overrides,
    };
}

describe("gate_web_auth_profiles: baseline", () => {
    it("accepts the minimal valid fixture with zero violations", () => {
        const b = baseline();
        const violations = runGate(makeInputs(b));
        expect(violations).toEqual([]);
    });
});

describe("gate_web_auth_profiles: each failure class fires on a seeded violation", () => {
    it("unowned_surface: a discovered action with no row fails", () => {
        const b = baseline();
        b.actions.push({
            id: "server_action:fixture/actions.ts#orphanAction",
            file: "fixture/actions.ts",
            exportName: "orphanAction",
            line: 20,
        });
        const violations = runGate(makeInputs(b));
        expect(
            violations.some((v) => v.rule === "unowned_surface" && v.id?.includes("orphanAction")),
        ).toBe(true);
    });

    it("stale_row: a row whose id discovery no longer produces fails", () => {
        const b = baseline();
        b.actions = []; // "doThing" no longer discovered in source
        const violations = runGate(makeInputs(b));
        expect(
            violations.some(
                (v) =>
                    v.rule === "stale_row" && v.id === "server_action:fixture/actions.ts#doThing",
            ),
        ).toBe(true);
    });

    it("duplicate_id: two rows sharing an id fails", () => {
        const b = baseline();
        b.doc.rows.push({ ...b.doc.rows[1] });
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "duplicate_id")).toBe(true);
    });

    it("closed_vocabulary: an accepted_credential_classes value outside the closed list fails", () => {
        const b = baseline();
        b.doc.rows[1].accepted_credential_classes = ["not_a_real_credential_class"];
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "closed_vocabulary")).toBe(true);
    });

    it("closed_vocabulary: an unknown surface_kind fails", () => {
        const b = baseline();
        (b.doc.rows[1] as EndpointProfileRow).surface_kind = "smoke_signal";
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "closed_vocabulary")).toBe(true);
    });

    it("closed_vocabulary: an unknown service fails", () => {
        const b = baseline();
        (b.doc.rows[1] as EndpointProfileRow).service = "dev-health-carrier-pigeon";
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "closed_vocabulary")).toBe(true);
    });

    it("closed_vocabulary: a service value added to the live schema's enum IS accepted (not hardcoded)", () => {
        const b = baseline();
        (b.doc.rows[1] as EndpointProfileRow).service = "dev-health-new-service";
        const violations = runGate(
            makeInputs(b, {
                serviceVocabulary: [
                    "dev-health-ops-api",
                    "dev-health-ops-billing-edge",
                    "dev-health-web",
                    "dev-health-acr-api",
                    "dev-health-acr-mcp",
                    "dev-health-new-service",
                ],
            }),
        );
        expect(violations.filter((v) => v.rule === "closed_vocabulary")).toEqual([]);
    });

    it("closed_vocabulary: service check is an honest skip when serviceVocabulary is unavailable (null)", () => {
        const b = baseline();
        (b.doc.rows[1] as EndpointProfileRow).service = "dev-health-carrier-pigeon";
        const violations = runGate(makeInputs(b, { serviceVocabulary: null }));
        expect(violations.filter((v) => v.rule === "closed_vocabulary")).toEqual([]);
    });

    it("anchor_drift: a row.source pointing at the wrong line fails", () => {
        const b = baseline();
        b.doc.rows[1].source = { file: "fixture/actions.ts", line: 999 };
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "anchor_drift")).toBe(true);
    });

    it("schema_violation: a stray top-level document key fails (schema's additionalProperties:false)", () => {
        const b = baseline();
        (b.doc as unknown as Record<string, unknown>).unexpected_field = "surprise";
        const violations = runGate(makeInputs(b));
        expect(
            violations.some(
                (v) => v.rule === "schema_violation" && v.detail.includes("unexpected_field"),
            ),
        ).toBe(true);
    });

    it("schema_violation: a row missing a required field fails", () => {
        const b = baseline();
        delete (b.doc.rows[1] as unknown as Record<string, unknown>).classification;
        const violations = runGate(makeInputs(b));
        expect(
            violations.some(
                (v) => v.rule === "schema_violation" && v.detail.includes("classification"),
            ),
        ).toBe(true);
    });

    it('unstated_null: classification "public" with no public_rationale fails', () => {
        const b = baseline();
        b.doc.rows[1].classification = "public";
        b.doc.rows[1].public_rationale = null;
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "unstated_null")).toBe(true);
    });

    it("unstated_null: protected row with primary_validator: null and no explanatory gaps entry fails", () => {
        const b = baseline();
        b.doc.rows[1].primary_validator = null;
        b.doc.rows[1].gaps = [];
        const violations = runGate(makeInputs(b));
        expect(violations.some((v) => v.rule === "unstated_null")).toBe(true);
    });

    it("unstated_null: protected row with primary_validator: null IS accepted when gaps discloses it", () => {
        const b = baseline();
        b.doc.rows[1].primary_validator = null;
        b.doc.rows[1].gaps = [
            "primary_validator: null -- no rejecting validator exists in this action's own call chain.",
        ];
        const violations = runGate(makeInputs(b));
        expect(violations.filter((v) => v.rule === "unstated_null")).toEqual([]);
    });

    it(
        "degrades_silently: THE fetchers.ts:32-36 shape -- auth() called but falls back to a default " +
            "instead of rejecting, with no gaps disclosure -- fails the gate",
        () => {
            const b = baseline();
            b.sources["fixture/actions.ts"] =
                "export async function doThing() {\n" +
                "    const session = await auth();\n" +
                '    const orgId = session?.user?.org_id ?? "default-org";\n' +
                "    return orgId;\n" +
                "}\n";
            // gaps stays empty -- the degrading fallback is NOT disclosed.
            const violations = runGate(makeInputs(b));
            expect(
                violations.some(
                    (v) =>
                        v.rule === "degrades_silently" &&
                        v.id === "server_action:fixture/actions.ts#doThing",
                ),
            ).toBe(true);
        },
    );

    it("degrades_silently: the SAME degrading code IS accepted once gaps discloses it (fetchFlagPage/listBillingPlans pattern)", () => {
        const b = baseline();
        b.sources["fixture/actions.ts"] =
            "export async function doThing() {\n" +
            "    const session = await auth();\n" +
            '    const orgId = session?.user?.org_id ?? "default-org";\n' +
            "    return orgId;\n" +
            "}\n";
        b.doc.rows[1].gaps = [
            "primary_validator anchors code that calls auth() but degrades to a default instead of rejecting on no session -- NO REJECTING VALIDATOR EXISTS in this action's own chain.",
        ];
        const violations = runGate(makeInputs(b));
        expect(violations.filter((v) => v.rule === "degrades_silently")).toEqual([]);
    });

    it("degrades_silently does NOT false-positive on the checkout.ts inline-reject shape (if (!session?.access_token) return)", () => {
        const b = baseline();
        b.sources["fixture/actions.ts"] =
            "export async function doThing() {\n" +
            "    const session = await auth();\n" +
            "    if (!session?.access_token) {\n" +
            '        return { error: "Unauthorized" };\n' +
            "    }\n" +
            "    return session.access_token;\n" +
            "}\n";
        b.doc.rows[1].primary_validator = {
            description: "Inline check: if (!session?.access_token) return {error}.",
            anchor: { path: "fixture/actions.ts", line: 2, line_end: 5 },
        };
        const violations = runGate(makeInputs(b));
        expect(violations.filter((v) => v.rule === "degrades_silently")).toEqual([]);
    });

    it("degrades_silently does NOT false-positive on the feature-flags/actions.ts inline-reject shape (fetchFlagPage's own CHAOS-4728 fix: if (!session?.user?.org_id) throw)", () => {
        const b = baseline();
        b.sources["fixture/actions.ts"] =
            "export async function doThing() {\n" +
            "    const session = await auth();\n" +
            "    if (!session?.user?.org_id) {\n" +
            '        throw new Error("Unauthorized");\n' +
            "    }\n" +
            "    return session.user.org_id;\n" +
            "}\n";
        b.doc.rows[1].primary_validator = {
            description: "Inline check: if (!session?.user?.org_id) throw.",
            anchor: { path: "fixture/actions.ts", line: 2, line_end: 5 },
        };
        const violations = runGate(makeInputs(b));
        expect(violations.filter((v) => v.rule === "degrades_silently")).toEqual([]);
    });
});

describe("gate_web_auth_profiles: checkContractInputsPresent (fix-by-context: skip locally, FAIL in CI)", () => {
    it("nothing missing: never fatal, no message, regardless of CI", () => {
        expect(checkContractInputsPresent(true, [])).toEqual({ fatal: false, message: null });
        expect(checkContractInputsPresent(false, [])).toEqual({ fatal: false, message: null });
    });

    it("local run (inCI=false): missing input is an honest, non-fatal WARN naming what's missing", () => {
        const result = checkContractInputsPresent(false, [
            "credential-classes.json (--credential-classes)",
        ]);
        expect(result.fatal).toBe(false);
        expect(result.message).toMatch(/^WARN:/);
        expect(result.message).toContain("credential-classes.json");
    });

    it("CI run (inCI=true): missing input is FATAL, message says FAIL and names what's missing", () => {
        const result = checkContractInputsPresent(true, [
            "credential-classes.json (--credential-classes)",
            "endpoint-profile.schema.json (--schema)",
        ]);
        expect(result.fatal).toBe(true);
        expect(result.message).toMatch(/^FAIL:/);
        expect(result.message).toContain("credential-classes.json");
        expect(result.message).toContain("endpoint-profile.schema.json");
    });
});

function envWithout(...keys: string[]): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const k of keys) delete env[k];
    return env;
}

describe("gate_web_auth_profiles: main() CLI, CI mode, missing contract inputs (spawns the real script)", () => {
    const scriptPath = resolve(WEB_ROOT, "ci/gate_web_auth_profiles.ts");
    const tsxBin = resolve(WEB_ROOT, "node_modules/.bin/tsx");

    it("exits 1 (not 0) under CI=true with no --credential-classes/--schema and no sibling ops checkout", () => {
        const env = envWithout("GITHUB_ACTIONS");
        env.CI = "true";
        const result = spawnSync(tsxBin, [scriptPath, "--root", WEB_ROOT], {
            cwd: WEB_ROOT,
            encoding: "utf8",
            env,
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/^FAIL:/m);
        expect(result.stderr).toContain("credential-classes.json");
        expect(result.stderr).toContain("endpoint-profile.schema.json");
    });

    it("exits 0 (WARN only) locally (CI unset) with the same missing inputs", () => {
        const env = envWithout("CI", "GITHUB_ACTIONS");
        const result = spawnSync(tsxBin, [scriptPath, "--root", WEB_ROOT], {
            cwd: WEB_ROOT,
            encoding: "utf8",
            env,
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toMatch(/^WARN:/m);
    });
});

describe("gate_web_auth_profiles: real repo state", () => {
    it("the committed endpoint-profiles.web.json currently has zero violations against live discovery", () => {
        const doc = JSON.parse(
            readFileSync(resolve(WEB_ROOT, "contracts/auth/v1/endpoint-profiles.web.json"), "utf8"),
        );
        const routes = discoverRoutes(WEB_ROOT);
        const { actions } = discoverServerActionFiles(WEB_ROOT);
        const violations = runGate({
            discoveredRoutes: routes,
            discoveredActions: actions,
            doc,
            // credential-classes.json/endpoint-profile.schema.json live in the
            // sibling ops lane worktree in THIS dev environment, not in a
            // location this test can rely on in every CI runner --
            // closed_vocabulary for accepted_credential_classes/service is
            // intentionally not exercised here (each has its own
            // seeded-fixture test above); every OTHER rule still runs against
            // the real rows.
            credentialClasses: null,
            serviceVocabulary: null,
            readSource: (path, line, lineEnd) => {
                try {
                    const lines = readFileSync(resolve(WEB_ROOT, path), "utf8").split("\n");
                    return lines.slice(Math.max(0, line - 1), lineEnd).join("\n");
                } catch {
                    return null;
                }
            },
        });
        expect(violations).toEqual([]);
    });
});
