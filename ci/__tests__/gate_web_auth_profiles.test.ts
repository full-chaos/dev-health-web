import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
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

// SELF-CONTAINED schema fixtures, deliberately not the real ops-owned files.
//
// These unit tests run in the `unit` job, which has no sparse checkout of the
// ops contracts -- reading the real files here would either fail there or, if
// resolved through some sibling-checkout path, pass on a contract nobody
// named. That fallback is precisely what this gate just deleted, and on the
// acr side it is exactly why a CI failure never reproduced locally. The real
// contract is exercised by the gate step in CI, which supplies it explicitly.
//
// They mirror the SHAPE that matters for these cases: a closed row object so
// a misspelled field is caught, and a declared type on primary_validator so a
// wrong type is caught.
const FIXTURE_PROFILE_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
        rows: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    id: { type: "string" },
                    surface_kind: { type: "string" },
                    method: { type: ["string", "null"] },
                    route: { type: ["string", "null"] },
                    service: { type: "string" },
                    source: { type: "object" },
                    classification: { type: "string" },
                    public_rationale: { type: ["string", "null"] },
                    accepted_credential_classes: { type: "array" },
                    primary_validator: { type: ["object", "null"] },
                    gaps: { type: "array" },
                },
            },
        },
    },
} as const;

const FIXTURE_CREDENTIAL_CLASS_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["classes"],
    properties: {
        classes: {
            type: "array",
            items: {
                type: "object",
                required: ["class_id", "issuer", "validator"],
                properties: {
                    class_id: { type: "string" },
                    issuer: { type: "string" },
                    validator: { type: "string" },
                },
            },
        },
    },
} as const;

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
        // Fixture inputs default to null: these unit tests exercise the
        // hand-rolled rules, and full schema validation is covered against
        // the REAL ops schema in the "real repo state" block below plus the
        // dedicated schema-validation tests. null means "skipped", which the
        // gate reports rather than silently treating as passed.
        schemaDocument: null,
        credentialClassesDocument: null,
        credentialClassesSchemaDocument: null,
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
    // --- merge-gate fixes: three classes this gate accepted before -------
    //
    // Each was EXECUTED against the real inventory and the real ops contract
    // before it was fixed, and each returned
    // "PASS: 18 routes + 150 server actions, 0 violations."

    it("schema_violation: a row field with the wrong type fails full schema validation", () => {
        // Before: this gate hand-rolled its top-level checks and validated no
        // ROW against the schema at all, so primary_validator: 17 passed on
        // all 168 rows. That is the same defect ops's own first review round
        // found and fixed, and acr fixed after it; web inherited the design
        // and not the fix.
        const b = baseline();
        const doc = structuredClone(b.doc) as EndpointProfileDoc;
        (doc.rows[0] as Record<string, unknown>).primary_validator = 17;
        const violations = runGate(makeInputs(b, { doc, schemaDocument: FIXTURE_PROFILE_SCHEMA }));
        expect(
            violations.some(
                (v) => v.rule === "schema_violation" && v.detail.includes("primary_validator"),
            ),
        ).toBe(true);
    });

    it("schema_violation: a misspelled row field fails additionalProperties:false", () => {
        const b = baseline();
        const doc = structuredClone(b.doc) as EndpointProfileDoc;
        (doc.rows[0] as Record<string, unknown>).primary_validtor = "misspelled";
        const violations = runGate(makeInputs(b, { doc, schemaDocument: FIXTURE_PROFILE_SCHEMA }));
        expect(
            violations.some(
                (v) =>
                    v.rule === "schema_violation" &&
                    v.detail.includes("must NOT have additional properties"),
            ),
        ).toBe(true);
    });

    it("closed_vocabulary: credential classes stripped to ids only fail their own schema", () => {
        // Before: the credential-class document was reduced to a list of ids
        // and never validated, so a vocabulary whose entries had lost their
        // issuer, validator, lifecycle authority and allowed route set still
        // passed. "Closed vocabulary" then means a closed set of ids, not the
        // guarantee the inventory cites.
        const b = baseline();
        const violations = runGate(
            makeInputs(b, {
                credentialClassesDocument: {
                    classes: [{ class_id: "auth_js_browser_session" }],
                },
                credentialClassesSchemaDocument: FIXTURE_CREDENTIAL_CLASS_SCHEMA,
            }),
        );
        expect(violations.some((v) => v.rule === "closed_vocabulary")).toBe(true);
    });

    it("closed_vocabulary: a duplicate class_id is rejected", () => {
        // JSON Schema cannot express uniqueness of a field ACROSS objects in
        // an array -- uniqueItems compares whole items, and two entries
        // differing in any other field are already "unique" -- so this has to
        // be a gate rule.
        const b = baseline();
        const violations = runGate(
            makeInputs(b, {
                credentialClassesDocument: {
                    classes: [
                        { class_id: "auth_js_browser_session", issuer: "a" },
                        { class_id: "auth_js_browser_session", issuer: "b" },
                    ],
                },
            }),
        );
        expect(
            violations.some(
                (v) =>
                    v.rule === "closed_vocabulary" &&
                    v.detail.includes("auth_js_browser_session") &&
                    v.detail.includes("2 times"),
            ),
        ).toBe(true);
    });

    it("a schema that cannot be compiled is reported, never treated as no violations", () => {
        // A validator that cannot run must say so. Returning [] here would be
        // the exact shape of defect this gate exists to catch.
        const b = baseline();
        const violations = runGate(
            makeInputs(b, { schemaDocument: { type: "not-a-real-json-schema-type" } }),
        );
        expect(violations.some((v) => v.detail.includes("NOTHING was validated against it"))).toBe(
            true,
        );
    });

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
    }, 30_000);

    it("exits 0 (WARN only) locally (CI unset) with the same missing inputs", () => {
        const env = envWithout("CI", "GITHUB_ACTIONS");
        const result = spawnSync(tsxBin, [scriptPath, "--root", WEB_ROOT], {
            cwd: WEB_ROOT,
            encoding: "utf8",
            env,
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toMatch(/^WARN:/m);
    }, 30_000);
});

describe("tests.yml: an inventory-only change must still run the gate", () => {
    // THE CLASS, not the instance. The gate is correct when the quality job
    // runs; the defect was that a PR touching ONLY the inventory did not run
    // it. `changes.code` had no contracts pattern, so code=false skipped
    // quality and the aggregate job succeeded having checked nothing -- the
    // one file most likely to be edited alone being the edit that skips its
    // own check.
    //
    // Asserted against the workflow text rather than mocked, and paired with a
    // negative control below, because an assertion that cannot fail is the
    // thing this whole PR exists to catch.
    function codeFilterPatterns(workflow: string): string[] {
        const lines = workflow.split("\n");
        const start = lines.findIndex((l) => /^\s+code:\s*$/.test(l));
        if (start === -1) return [];
        const out: string[] = [];
        for (const line of lines.slice(start + 1)) {
            const m = /^\s+- '(.+)'\s*$/.exec(line);
            if (m) {
                out.push(m[1]);
                continue;
            }
            if (/^\s+#/.test(line) || line.trim() === "") continue;
            break;
        }
        return out;
    }

    const workflowText = readFileSync(resolve(WEB_ROOT, ".github/workflows/tests.yml"), "utf8");

    it("the code filter covers the endpoint-profile inventory", () => {
        const patterns = codeFilterPatterns(workflowText);
        expect(patterns.length).toBeGreaterThan(0);
        const covers = patterns.some((p) => p === "contracts/**" || p.startsWith("contracts/auth"));
        expect(covers).toBe(true);
    });

    it("negative control: the same assertion fails when the contracts pattern is removed", () => {
        const mutated = workflowText
            .split("\n")
            .filter((l) => !/^\s+- 'contracts\/\*\*'\s*$/.test(l))
            .join("\n");
        const patterns = codeFilterPatterns(mutated);
        expect(patterns.length).toBeGreaterThan(0);
        const covers = patterns.some((p) => p === "contracts/**" || p.startsWith("contracts/auth"));
        expect(covers).toBe(false);
    });
});

describe("discover_web_routes: legal export forms and route locations", () => {
    // Each of these was EXECUTED against the gate before the fix and returned a
    // clean PASS with a real surface invisible to it. They are ordinary
    // TypeScript and ordinary Next.js layout, not exotic constructions.

    function scratchTree(): string {
        const dir = mkdtempSync(join(tmpdir(), "web-discovery-"));
        mkdirSync(join(dir, "src/app/api/hidden"), { recursive: true });
        mkdirSync(join(dir, "src/app/(group)/deep/nested"), { recursive: true });
        mkdirSync(join(dir, "src/app/actions"), { recursive: true });
        writeFileSync(
            join(dir, "src/app/api/hidden/route.ts"),
            'const handler = async () => new Response("secret");\nexport { handler as POST };\n',
        );
        writeFileSync(
            join(dir, "src/app/(group)/deep/nested/route.ts"),
            "export async function GET() { return new Response('ok'); }\n",
        );
        writeFileSync(
            join(dir, "src/app/actions/probe.ts"),
            '/* licence header */\n"use server";\nexport async function hiddenAction() { return 1; }\n',
        );
        return dir;
    }

    it("finds a handler exported as `export { handler as POST }`", () => {
        const dir = scratchTree();
        try {
            const routes = discoverRoutes(dir);
            expect(routes.some((r) => r.method === "POST" && r.route === "/api/hidden")).toBe(true);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("finds route handlers outside src/app/api and strips route groups from the path", () => {
        // The live gap this closed: two authenticated admin route handlers and
        // /health sat outside src/app/api and were absent from the inventory,
        // which nonetheless claimed to enumerate every route.
        const dir = scratchTree();
        try {
            const routes = discoverRoutes(dir);
            expect(routes.some((r) => r.route === "/deep/nested")).toBe(true);
            expect(routes.some((r) => r.route.includes("(group)"))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('recognises a "use server" module preceded by a block comment', () => {
        const dir = scratchTree();
        try {
            const { actions } = discoverServerActionFiles(dir);
            expect(actions.map((a) => a.exportName)).toContain("hiddenAction");
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("discover_web_routes: every exported action on a line is discovered", () => {
    it("finds BOTH actions when two are written on one line", () => {
        // CHAOS-3273 merge-gate, EXECUTED against the real tree: discovery
        // used one .exec() per line, so the second export was invisible. With
        // the first profiled and the second not, the gate reported
        //   PASS: 18 routes + 151 server actions, 0 violations.
        // while an entirely unprofiled Server Action sat in the source.
        // Guardrail G-1 defeated by a semicolon. The sibling acr gate had the
        // identical defect in Go.
        const dir = mkdtempSync(join(tmpdir(), "web-sameline-"));
        const actionsDir = join(dir, "src/app/(app)/probe");
        mkdirSync(actionsDir, { recursive: true });
        writeFileSync(
            join(actionsDir, "actions.ts"),
            '"use server";\n' +
                "export async function alphaProbe() { return 1; } export async function betaProbe() { return 2; }\n",
        );
        const cwd = process.cwd();
        try {
            process.chdir(dir);
            const { actions } = discoverServerActionFiles(dir);
            const names = actions.map((a) => a.exportName).sort();
            expect(names).toEqual(["alphaProbe", "betaProbe"]);
        } finally {
            process.chdir(cwd);
            rmSync(dir, { recursive: true, force: true });
        }
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
            schemaDocument: null,
            credentialClassesDocument: null,
            credentialClassesSchemaDocument: null,
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
