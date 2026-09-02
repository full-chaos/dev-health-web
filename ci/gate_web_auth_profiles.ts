#!/usr/bin/env -S pnpm tsx
/**
 * CHAOS-3273 Wave 0: web's auth-profile CI gate.
 *
 * Guardrail G-1 (contracts/auth/v1/endpoint-profile.schema.json): a route
 * without a registered profile fails CI and may not ship. This gate enforces
 * that for dev-health-web by diffing `ci/discover_web_routes.ts`'s
 * independent source discovery against `contracts/auth/v1/endpoint-profiles.web.json`.
 *
 * Exported `runGate(opts)` is the whole check, pure enough to unit-test: it
 * takes an already-loaded discovery report + profile document (+ optional
 * credential-classes doc and a `readSource` function) and returns a list of
 * violations. `main()` wires that to real files/CLI args. Every failure
 * class below has a seeded-fixture proving test in
 * `ci/__tests__/gate_web_auth_profiles.test.ts` -- a failure class with no
 * test asserting the gate actually rejects it is not trusted here.
 *
 * Failure classes:
 *   - unowned_surface       a discovered route/action has no row (id) at all
 *   - stale_row             a row's id no longer matches anything discovered
 *   - duplicate_id          two rows share the same id
 *   - closed_vocabulary     accepted_credential_classes / service / surface_kind
 *                           use a value outside the closed vocabulary
 *   - anchor_drift          a row's source.file:line does not match what was
 *                           independently (re-)discovered for that id
 *   - schema_violation      stray top-level document keys (the schema's own
 *                           top-level additionalProperties:false), or a row
 *                           missing one of the schema's required fields
 *   - unstated_null         public_rationale null while classification is
 *                           "public" (or non-null while "protected"); a
 *                           protected row's primary_validator is null/
 *                           non-rejecting with no gaps entry explaining it
 *   - degrades_silently     ★ the corrected predicate (2026-09-01): a
 *                           protected server_action row whose primary_validator
 *                           anchor does not demonstrably contain a call to a
 *                           known-REJECTING guard function, and whose gaps
 *                           array does not disclose that -- this is the
 *                           `fetchers.ts:32-36`-shaped defect (auth() called,
 *                           but falls back to a default instead of rejecting)
 *                           that a textual "does it call auth()" grep clears.
 *
 * ★ HONESTY LIMIT (read before trusting this beyond what it proves): the
 * `degrades_silently` / `unstated_null` primary_validator checks are LEXICAL
 * -- they check whether the anchored source snippet contains a call to one
 * of a fixed allowlist of helper functions already proven (by hand, this
 * pass) to reject on no session:
 *   getSessionContext, requireSuperuserToken, getToken, resolveOrgId,
 *   getAuthHeaders, getAuthHeadersOrThrow, apiRequest, withAuthHeaders
 * plus a small set of hand-verified INLINE reject shapes (see
 * INLINE_REJECT_PATTERNS below) that are not routed through any named
 * helper. This is NOT full control-flow/data-flow analysis. It cannot prove
 * a novel guard function actually rejects (a new helper must be added to
 * REJECTING_GUARD_NAMES, or a new shape to INLINE_REJECT_PATTERNS, below
 * once verified by hand, the same way this pass verified the existing
 * entries by reading every call site) and it cannot catch a guard call
 * whose result is silently discarded in a way this lexical scan doesn't
 * recognize. What it DOES mechanically guarantee: a row cannot claim
 * `primary_validator` protection anchored at code that contains none of the
 * known-rejecting shapes without an explicit gaps disclosure -- the exact
 * shape the fetchFlagPage/listBillingPlans findings had before their fix
 * (CHAOS-4728, merged fcc3c1db), and the shape a future lane is most likely
 * to reintroduce by accident.
 *
 * CONTRACT INPUTS (schema + credential-classes) are owned by dev-health-ops
 * and are not vendored here. `main()` resolves them from `--schema` /
 * `--credential-classes`, falling back to sibling-checkout default paths
 * for local dev. A missing input is an honest SKIP in a local run (every
 * other check still ran) but a hard FAIL in CI (CI or GITHUB_ACTIONS env
 * set) -- see `checkContractInputsPresent`. An honest warning that still
 * exits 0 is a green build nobody reads the warning on.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
// The 2020 entry point, NOT ajv's default export: the ops-owned schemas
// declare Draft 2020-12 and the default export implements draft-07.
import Ajv2020 from "ajv/dist/2020";
// ajv-formats 3.0.1 is already a dependency. Without it ajv logs
// 'unknown format "date-time" ignored' and does not enforce the keyword --
// in Draft 2020-12 `format` is annotation-only unless the validator opts in,
// so an unenforced format is spec-legal but still a check the schema asks
// for and we would not be doing.
import addFormats from "ajv-formats";
import {
    discoverRoutes,
    discoverServerActionFiles,
    type RouteRecord,
    type ServerActionRecord,
} from "./discover_web_routes";

export type EndpointProfileRow = {
    id: string;
    surface_kind: string;
    method: string | null;
    route: string | null;
    service: string;
    source: { file: string; line: number };
    classification: "protected" | "public";
    public_rationale: string | null;
    accepted_credential_classes: string[];
    primary_validator: {
        description: string;
        anchor: { path: string; line: number; line_end?: number } | null;
    } | null;
    gaps: string[];
    [key: string]: unknown;
};

export type EndpointProfileDoc = {
    schema_version: string;
    generated_at: string;
    source_commit: string;
    credential_class_source?: string;
    rows: EndpointProfileRow[];
    [key: string]: unknown;
};

export type Violation = {
    rule:
        | "unowned_surface"
        | "stale_row"
        | "duplicate_id"
        | "closed_vocabulary"
        | "anchor_drift"
        | "schema_violation"
        | "unstated_null"
        | "degrades_silently";
    id?: string;
    detail: string;
};

const TOP_LEVEL_REQUIRED = ["schema_version", "generated_at", "source_commit", "rows"];
const TOP_LEVEL_ALLOWED = new Set([...TOP_LEVEL_REQUIRED, "credential_class_source"]);

const ROW_REQUIRED = [
    "id",
    "surface_kind",
    "method",
    "route",
    "service",
    "source",
    "classification",
    "gaps",
];

const SURFACE_KINDS = new Set(["rest", "graphql_field", "graphql_mutation", "server_action"]);
// "service" is NOT hardcoded here: it is read live from
// endpoint-profile.schema.json ($defs.endpointProfile.properties.service.enum)
// via loadServiceVocabulary/GateInputs.serviceVocabulary below, the same way
// the ops gate does -- a schema-level addition (a newly deployed app) is
// accepted with zero checker code change instead of being wrongly rejected.

// See the ★ HONESTY LIMIT block in the module docstring before extending or
// relying on this list beyond what it proves.
const REJECTING_GUARD_NAMES = [
    "getSessionContext",
    "requireSuperuserToken",
    "getToken",
    "resolveOrgId",
    "getAuthHeaders",
    "getAuthHeadersOrThrow",
    "apiRequest",
    "withAuthHeaders",
];
const REJECTING_GUARD_RE = new RegExp(`\\b(?:${REJECTING_GUARD_NAMES.join("|")})\\b`);
// Hand-rolled inline reject shapes, each verified by hand at its own call
// site (not routed through a named helper, but still an unconditional
// return/throw on no session):
const INLINE_REJECT_PATTERNS = [
    // checkout.ts's createBillingPlan/updateBillingPlan/deleteBillingPlan/
    // syncBillingPlanToStripe/listBillingPlans (listBillingPlans fixed
    // CHAOS-3273 Wave 0, 2026-09-01): `if (!session?.access_token) return ...`.
    // The DEGRADING counterexample this gate exists to catch (listBillingPlans
    // before its fix) used `session?.access_token` only inside an `if` whose
    // body ATTACHES a header -- no `return`/`throw` -- so requiring `return`
    // or `throw` on the SAME lexical scan is what distinguishes the two, not
    // just the presence of the `access_token` check.
    /!\s*session\?\.access_token\)[^]*?(?:return|throw)/,
    // feature-flags/actions.ts's fetchFlagPage (CHAOS-4728, merged fcc3c1db):
    // `if (!session?.user?.org_id) { throw new Error(AuthErrors.Unauthorized); }`.
    /!\s*session\?\.user\?\.org_id\)[^]*?(?:return|throw)/,
];

function isDemonstrablyRejecting(snippet: string): boolean {
    return (
        REJECTING_GUARD_RE.test(snippet) || INLINE_REJECT_PATTERNS.some((re) => re.test(snippet))
    );
}

export interface GateInputs {
    discoveredRoutes: RouteRecord[];
    discoveredActions: ServerActionRecord[];
    doc: unknown;
    credentialClasses: string[] | null; // null = not available, closed-vocab check skipped (honest degrade)
    /**
     * Live "service" enum values from endpoint-profile.schema.json's
     * $defs.endpointProfile.properties.service.enum (ops-owned). null = not
     * available, closed-vocab check for `service` skipped (honest degrade,
     * same contract as credentialClasses above).
     */
    serviceVocabulary: string[] | null;
    /**
     * The whole ops-owned endpoint-profile.schema.json document. null = not
     * available, in which case full schema validation is SKIPPED (and said
     * to be skipped, never reported as passed).
     *
     * Merge-gate finding (CHAOS-3273): this gate hand-rolled its top-level
     * shape checks and validated no ROW against the schema at all, so
     * `primary_validator: 17` and a misspelled `primary_validtor` on a row
     * both passed across all 168 rows -- every declared type, every required
     * row field, `additionalProperties: false` on the row object and every
     * nested $defs enum went unenforced. This is the same defect ops's own
     * first review round found and fixed, and acr fixed after it; web
     * inherited the design and not the fix.
     */
    schemaDocument: unknown | null;
    /** The whole ops-owned credential-classes.json document (not just its ids). */
    credentialClassesDocument: unknown | null;
    /** The whole ops-owned credential-classes.schema.json document. */
    credentialClassesSchemaDocument: unknown | null;
    /** Reads `line`..`lineEnd` (1-indexed, inclusive) of `path`, relative to `webRoot`. Returns null if unreadable. */
    readSource: (path: string, line: number, lineEnd: number) => string | null;
}

/**
 * Full Draft 2020-12 validation of one document against one schema.
 *
 * ajv 8.20.0 is already a direct dependency of this repo, so this closes the
 * row-level hole with no new package. The 2020 entry point is required: the
 * ops-owned schemas declare
 * "$schema": "https://json-schema.org/draft/2020-12/schema", and ajv's
 * DEFAULT export implements draft-07 -- pointing it at a 2020-12 schema is
 * the same silent-under-validation trap acr's checker documents for
 * xeipuuv/gojsonschema, where constructs the validator cannot interpret are
 * quietly accepted and the gate reports green while checking less than it
 * claims.
 *
 * strict:false because these schemas carry annotation keywords ajv's strict
 * mode rejects outright; rejecting the ops-owned schema would turn a
 * validating gate into a crashing one. allErrors:true so one run reports
 * every violation rather than only the first.
 */
function validateAgainstSchema(
    schemaDocument: unknown,
    document: unknown,
    rule: Violation["rule"],
    label: string,
): Violation[] {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    let validate;
    try {
        validate = ajv.compile(schemaDocument as object);
    } catch (e) {
        // A schema this gate cannot compile is a hard stop, never a skip: a
        // validator that cannot run must say so rather than return "no
        // violations found".
        return [
            {
                rule,
                detail: `${label}: schema could not be compiled, so NOTHING was validated against it -- ${
                    e instanceof Error ? e.message : String(e)
                }`,
            },
        ];
    }
    if (validate(document)) return [];
    return (validate.errors ?? []).map((err) => ({
        rule,
        detail: `${label}: ${err.instancePath || "/"} ${err.message ?? "failed validation"}${
            err.params && Object.keys(err.params).length ? " " + JSON.stringify(err.params) : ""
        }`,
    }));
}

/**
 * A closed vocabulary that can hold one class_id twice, with two different
 * definitions, is not closed. JSON Schema cannot express uniqueness of a
 * field ACROSS objects in an array (uniqueItems compares whole items, and two
 * entries differing in any other field are already "unique"), so this is a
 * gate rule by necessity rather than preference.
 */
function duplicateCredentialClassViolations(credentialClassesDocument: unknown): Violation[] {
    if (!isPlainObject(credentialClassesDocument)) return [];
    const classes = credentialClassesDocument.classes;
    if (!Array.isArray(classes)) return [];
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const cls of classes) {
        if (!isPlainObject(cls)) continue;
        const id = cls.class_id;
        if (typeof id !== "string") continue;
        if (!counts.has(id)) order.push(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const violations: Violation[] = [];
    for (const id of order) {
        const n = counts.get(id) ?? 0;
        if (n > 1) {
            violations.push({
                rule: "closed_vocabulary",
                detail: `credential-classes.json declares class_id "${id}" ${n} times -- a closed vocabulary cannot hold one id with two definitions (JSON Schema cannot express cross-object id uniqueness)`,
            });
        }
    }
    return violations;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** All ids this pass can independently re-derive from source, REST + server_action. */
function discoveredIdMap(
    routes: RouteRecord[],
    actions: ServerActionRecord[],
): Map<string, { file: string; line: number }> {
    const m = new Map<string, { file: string; line: number }>();
    // REST ids follow endpoint-profile.schema.json's "<METHOD> <full_path> [<service>]"
    // form; web only ever registers dev-health-web, matching every existing row.
    for (const r of routes) {
        const id = `${r.method} ${r.route} [dev-health-web]`;
        m.set(id, { file: r.file, line: r.line });
    }
    for (const a of actions) {
        m.set(a.id, { file: a.file, line: a.line });
    }
    return m;
}

export function runGate(input: GateInputs): Violation[] {
    const violations: Violation[] = [];
    const {
        doc,
        discoveredRoutes,
        discoveredActions,
        credentialClasses,
        serviceVocabulary,
        schemaDocument,
        credentialClassesDocument,
        credentialClassesSchemaDocument,
        readSource,
    } = input;

    if (!isPlainObject(doc)) {
        violations.push({ rule: "schema_violation", detail: "document is not a JSON object" });
        return violations;
    }

    // Full schema validation FIRST, then the hand-rolled checks below. The
    // hand-rolled ones are kept because they produce better-targeted messages
    // for the cases they cover; they are no longer the only thing standing
    // between a malformed row and a green gate.
    if (schemaDocument !== null) {
        violations.push(
            ...validateAgainstSchema(
                schemaDocument,
                doc,
                "schema_violation",
                "endpoint-profiles.web.json",
            ),
        );
    }
    if (credentialClassesDocument !== null && credentialClassesSchemaDocument !== null) {
        violations.push(
            ...validateAgainstSchema(
                credentialClassesSchemaDocument,
                credentialClassesDocument,
                "closed_vocabulary",
                "credential-classes.json",
            ),
        );
    }
    violations.push(...duplicateCredentialClassViolations(credentialClassesDocument));

    for (const key of TOP_LEVEL_REQUIRED) {
        if (!(key in doc)) {
            violations.push({ rule: "schema_violation", detail: `missing top-level "${key}"` });
        }
    }
    for (const key of Object.keys(doc)) {
        if (!TOP_LEVEL_ALLOWED.has(key)) {
            violations.push({
                rule: "schema_violation",
                detail: `stray top-level key "${key}" -- schema's document object sets additionalProperties:false`,
            });
        }
    }

    const rowsRaw = doc.rows;
    if (!Array.isArray(rowsRaw)) {
        violations.push({ rule: "schema_violation", detail: '"rows" is not an array' });
        return violations;
    }
    const rows = rowsRaw as EndpointProfileRow[];

    // duplicate_id
    const seenIds = new Map<string, number>();
    for (const row of rows) {
        seenIds.set(row.id, (seenIds.get(row.id) ?? 0) + 1);
    }
    for (const [id, count] of seenIds) {
        if (count > 1) {
            violations.push({ rule: "duplicate_id", id, detail: `id appears ${count} times` });
        }
    }

    const discovered = discoveredIdMap(discoveredRoutes, discoveredActions);
    const webRowsById = new Map<string, EndpointProfileRow>();

    for (const row of rows) {
        if (!isPlainObject(row)) {
            violations.push({ rule: "schema_violation", detail: "a row is not an object" });
            continue;
        }
        for (const key of ROW_REQUIRED) {
            if (!(key in row)) {
                violations.push({
                    rule: "schema_violation",
                    id: row.id as string | undefined,
                    detail: `row missing required field "${key}"`,
                });
            }
        }
        if (!row.id) continue;

        // Only rows this repo owns (dev-health-web) and only surface kinds
        // this gate's discovery covers (rest, server_action) participate in
        // unowned/stale/anchor-drift checks below -- a future graphql_field/
        // graphql_mutation row (not yet discoverable by this script) is
        // exempted rather than flagged wrong.
        if (row.service === "dev-health-web") {
            webRowsById.set(row.id, row);
        }

        if (row.surface_kind && !SURFACE_KINDS.has(row.surface_kind)) {
            violations.push({
                rule: "closed_vocabulary",
                id: row.id,
                detail: `surface_kind "${row.surface_kind}" is not in the closed vocabulary`,
            });
        }
        if (row.service && serviceVocabulary && !serviceVocabulary.includes(row.service)) {
            violations.push({
                rule: "closed_vocabulary",
                id: row.id,
                detail: `service "${row.service}" is not in the closed vocabulary`,
            });
        }
        if (credentialClasses && Array.isArray(row.accepted_credential_classes)) {
            for (const c of row.accepted_credential_classes) {
                if (!credentialClasses.includes(c)) {
                    violations.push({
                        rule: "closed_vocabulary",
                        id: row.id,
                        detail: `accepted_credential_classes includes "${c}", not in credential-classes.json's closed vocabulary`,
                    });
                }
            }
        }

        // unstated_null: public_rationale <-> classification pairing.
        if (row.classification === "public" && !row.public_rationale) {
            violations.push({
                rule: "unstated_null",
                id: row.id,
                detail: 'classification is "public" but public_rationale is null/empty',
            });
        }
        if (row.classification === "protected" && row.public_rationale) {
            violations.push({
                rule: "unstated_null",
                id: row.id,
                detail: 'classification is "protected" but public_rationale is set (should be null)',
            });
        }

        // degrades_silently / unstated-null-primary_validator, only for the
        // surface kind + service this pass verified by hand: web server_actions.
        if (
            row.service === "dev-health-web" &&
            row.surface_kind === "server_action" &&
            row.classification === "protected"
        ) {
            const gapsText = Array.isArray(row.gaps) ? row.gaps.join("\n") : "";
            const mentionsValidatorGap =
                /primary_validator/i.test(gapsText) &&
                (/no reject/i.test(gapsText) ||
                    /does not reject/i.test(gapsText) ||
                    /not currently enforced/i.test(gapsText) ||
                    /degrades/i.test(gapsText) ||
                    /NO REJECTING VALIDATOR/i.test(gapsText));

            if (row.primary_validator === null) {
                if (!mentionsValidatorGap) {
                    violations.push({
                        rule: "unstated_null",
                        id: row.id,
                        detail: 'protected server_action row has primary_validator: null with no gaps entry explaining it (naming "primary_validator" and why no rejecting check exists)',
                    });
                }
            } else if (row.primary_validator.anchor) {
                const { path, line, line_end } = row.primary_validator.anchor;
                const snippet = readSource(path, line, line_end ?? line + 8);
                const looksRejecting = snippet !== null && isDemonstrablyRejecting(snippet);
                if (!looksRejecting && !mentionsValidatorGap) {
                    violations.push({
                        rule: "degrades_silently",
                        id: row.id,
                        detail: `primary_validator.anchor (${path}:${line}) does not contain a call to a known-rejecting guard (${REJECTING_GUARD_NAMES.join(", ")}), and gaps does not disclose that this action degrades silently instead of rejecting`,
                    });
                }
            }
        }
    }

    // unowned_surface: every discovered id must have a row.
    for (const [id, loc] of discovered) {
        if (!webRowsById.has(id)) {
            violations.push({
                rule: "unowned_surface",
                id,
                detail: `discovered at ${loc.file}:${loc.line} but has no row in endpoint-profiles.web.json`,
            });
        }
    }

    // stale_row + anchor_drift: every dev-health-web rest/server_action row
    // must still be discoverable, at the file:line it claims.
    for (const [id, row] of webRowsById) {
        if (row.surface_kind !== "rest" && row.surface_kind !== "server_action") continue;
        const loc = discovered.get(id);
        if (!loc) {
            violations.push({
                rule: "stale_row",
                id,
                detail: "row's id is no longer produced by independent source discovery",
            });
            continue;
        }
        if (row.source?.file !== loc.file || row.source?.line !== loc.line) {
            violations.push({
                rule: "anchor_drift",
                id,
                detail: `row.source is ${row.source?.file}:${row.source?.line}, but discovery finds this id at ${loc.file}:${loc.line}`,
            });
        }
    }

    return violations;
}

function readSourceFromDisk(
    webRoot: string,
    path: string,
    line: number,
    lineEnd: number,
): string | null {
    const full = resolve(webRoot, path);
    if (!existsSync(full)) return null;
    try {
        const lines = readFileSync(full, "utf8").split("\n");
        return lines.slice(Math.max(0, line - 1), lineEnd).join("\n");
    } catch {
        return null;
    }
}

// There used to be a siblingOpsContractCandidates() here that resolved
// ../ops and ../../ops when --schema / --credential-classes were not passed,
// so a local run "just worked" in a monorepo checkout.
//
// It is deleted deliberately. From a web worktree, ../../ops is the
// developer's own ops CHECKOUT -- whatever branch and working state it
// happens to be in -- not the commit named in ci/ops-contract.pin. The gate
// would then report PASS without saying which contract it validated against,
// and a local green would mean nothing about the pinned one. Today the path
// does not even exist yet (that checkout is a commit behind the contract
// merge), which is worse rather than better: the crutch is LATENT and would
// switch itself on, silently, the next time someone pulls.
//
// The sibling lane hit the same shape from the other direction: acr's
// equivalent fallback is exactly why a CI failure never reproduced locally.
// Inputs are now passed explicitly or the check says it was skipped.

/** Reads and parses one explicitly-supplied JSON file. null if absent or unparseable. */
function loadJSONDocument(pathArg: string | null): unknown | null {
    if (!pathArg || !existsSync(pathArg)) return null;
    try {
        return JSON.parse(readFileSync(pathArg, "utf8"));
    } catch {
        return null;
    }
}

function credentialClassIds(credentialClassesDocument: unknown): string[] | null {
    if (!isPlainObject(credentialClassesDocument)) return null;
    const classes = credentialClassesDocument.classes;
    if (!Array.isArray(classes)) return null;
    return classes
        .filter(isPlainObject)
        .map((cls) => cls.class_id)
        .filter((id): id is string => typeof id === "string");
}

/**
 * Reads $defs.endpointProfile.properties.service.enum LIVE from the
 * ops-owned schema document, rather than hardcoding a vocabulary here, so a
 * schema-level "service" addition (a newly deployed app) is accepted with
 * zero gate change. Returns null if the schema has no enum there.
 */
function serviceVocabularyFrom(schemaDocument: unknown): string[] | null {
    if (!isPlainObject(schemaDocument)) return null;
    const defs = schemaDocument.$defs;
    if (!isPlainObject(defs)) return null;
    const profile = defs.endpointProfile;
    if (!isPlainObject(profile)) return null;
    const props = profile.properties;
    if (!isPlainObject(props)) return null;
    const service = props.service;
    if (!isPlainObject(service)) return null;
    const serviceEnum = service.enum;
    if (!Array.isArray(serviceEnum)) return null;
    return serviceEnum.filter((v): v is string => typeof v === "string");
}

/**
 * Decides whether missing ops-owned contract input(s) are fatal. Pure and
 * exported so the CI-vs-local behaviour is unit-testable without spawning
 * the CLI: skipping is an honest degrade in a LOCAL run (every other check
 * still ran), but an honest warning that still exits 0 is a green build
 * nobody reads the warning on -- in CI this must FAIL, naming exactly what
 * is missing. `inCI` should be `process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"`,
 * the unambiguous signal GitHub Actions runners set (and generic CI runners
 * conventionally set) but a plain local shell does not.
 */
export function checkContractInputsPresent(
    inCI: boolean,
    missing: string[],
): { fatal: boolean; message: string | null } {
    if (missing.length === 0) {
        return { fatal: false, message: null };
    }
    const detail = missing.join(", ");
    if (inCI) {
        return {
            fatal: true,
            message:
                `FAIL: missing ops-owned contract input(s) in CI: ${detail}. ` +
                "CI must supply these via the pinned sparse checkout (see ci/ops-contract.pin and " +
                ".github/workflows/tests.yml) -- a skip is only acceptable in a local run where " +
                "they were not passed. There is no implicit fallback path.",
        };
    }
    return {
        fatal: false,
        message:
            `WARN: missing ops-owned contract input(s), closed-vocabulary check(s) for them are ` +
            `SKIPPED, not passed: ${detail}. Every other check still ran. Checked --schema/` +
            "--schema / --credential-classes / --credential-classes-schema; there is no implicit fallback path, deliberately. " +
            "This is fatal in CI; CI/GITHUB_ACTIONS is unset here, so this is a local run.",
    };
}

function parseArgs(argv: string[]): {
    root: string;
    profile: string;
    credentialClasses: string | null;
    credentialClassesSchema: string | null;
    schema: string | null;
} {
    let root = process.cwd();
    let profile = join(root, "contracts/auth/v1/endpoint-profiles.web.json");
    let credentialClasses: string | null = null;
    let credentialClassesSchema: string | null = null;
    let schema: string | null = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--root") root = argv[++i];
        else if (argv[i] === "--profile") profile = argv[++i];
        else if (argv[i] === "--credential-classes") credentialClasses = argv[++i];
        else if (argv[i] === "--credential-classes-schema") credentialClassesSchema = argv[++i];
        else if (argv[i] === "--schema") schema = argv[++i];
    }
    return { root, profile, credentialClasses, credentialClassesSchema, schema };
}

function main() {
    const { root, profile, credentialClasses, credentialClassesSchema, schema } = parseArgs(
        process.argv.slice(2),
    );
    const inCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

    const discoveredRoutes = discoverRoutes(root);
    const { actions: discoveredActions } = discoverServerActionFiles(root);
    const doc = JSON.parse(readFileSync(profile, "utf8"));
    const schemaDocument = loadJSONDocument(schema);
    const credentialClassesDocument = loadJSONDocument(credentialClasses);
    const credentialClassesSchemaDocument = loadJSONDocument(credentialClassesSchema);
    const classes = credentialClassIds(credentialClassesDocument);
    const serviceVocabulary = serviceVocabularyFrom(schemaDocument);

    const missingInputs: string[] = [];
    if (!classes) missingInputs.push("credential-classes.json (--credential-classes)");
    if (!serviceVocabulary) missingInputs.push("endpoint-profile.schema.json (--schema)");
    if (!credentialClassesSchemaDocument) {
        missingInputs.push("credential-classes.schema.json (--credential-classes-schema)");
    }

    const { fatal, message } = checkContractInputsPresent(inCI, missingInputs);
    if (message) {
        process.stderr.write(message + "\n");
    }
    if (fatal) {
        process.exit(1);
    }

    const violations = runGate({
        discoveredRoutes,
        discoveredActions,
        doc,
        credentialClasses: classes,
        serviceVocabulary,
        schemaDocument,
        credentialClassesDocument,
        credentialClassesSchemaDocument,
        readSource: (p, l, le) => readSourceFromDisk(root, p, l, le),
    });

    if (violations.length === 0) {
        process.stdout.write(
            `PASS: ${discoveredRoutes.length} routes + ${discoveredActions.length} server actions, 0 violations.\n`,
        );
        process.exit(0);
    }

    process.stderr.write(`FAIL: ${violations.length} violation(s)\n`);
    for (const v of violations) {
        process.stderr.write(`  [${v.rule}] ${v.id ? v.id + " -- " : ""}${v.detail}\n`);
    }
    process.exit(1);
}

const isDirectRun =
    typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main();
}
