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
 *   - unstated_null         an advisory field (action, resource_resolver,
 *                           current_state_cache_behavior,
 *                           entitlement_requirement, disclosure_behavior,
 *                           token_shape) that is null with no gaps entry
 *                           beginning "<field>:" (absent = not applicable);
 *                           public_rationale null while classification is
 *                           "public" (or non-null while "protected"); a
 *                           protected row's primary_validator is null/
 *                           non-rejecting with no gaps entry explaining it
 *   - absent_without_proof      an advisory field left absent without a call-walk not_reachable
 *                           verdict (entitlement_requirement, token_shape), or absent on a
 *                           field with no predicate
 *   - reach_contradicts_row   a null or absent field whose entitlement gate or credential
 *                           read the call walk reaches; or a recorded entitlement_requirement
 *                           on a surface that reaches no gate
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
 * CHAOS-4780 RECONCILIATION: discovery also reports, per surface, whether a
 * guard function is reachable from the handler: its own body plus any function
 * it calls (wrapper calls such as withAuth(handler) included), resolved by the
 * type checker to a declaration, and counted only when that declaration is one
 * of GUARD_SYMBOLS (file + name, declared once in discover_web_routes.ts). A
 * local helper that shares a guard's name does not count; an aliased import of
 * a real guard does. The call walk is bounded; a surface that hits the bound is
 * reported `guard_unresolved` and fails. The gate rejects a `public` row on a
 * guarded surface, `primary_validator: null` on a guarded surface, and a
 * `protected` row on a surface with no guard found unless gaps discloses it.
 * A guard call counts only when awaited or returned, and only in code that can
 * run (nothing after a top-level return/throw, no `if (false)` arm). A promise
 * stored in a variable and awaited later is not counted.
 * NAMED GAP: "guarded" means a guard is REACHABLE from the handler, not that
 * every path passes through it; a guard reached only on one branch passes. A
 * surface whose handler cannot be resolved to a function (the NextAuth
 * `handlers` destructure) is not reconciled.
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
    GUARD_SYMBOLS,
    REJECTING_GUARD_NAMES,
    discoverRoutes,
    discoverServerActionFiles,
    isDemonstrablyRejecting,
    verifyGuardSymbols,
    verifyEntitlementSymbols,
    verifyCacheSymbols,
    verifyResolverSymbols,
    type Reach,
    type RouteRecord,
    type ServerActionRecord,
} from "./discover_web_routes";

const ADVISORY_FIELDS = [
    "action",
    "resource_resolver",
    "current_state_cache_behavior",
    "entitlement_requirement",
    "disclosure_behavior",
    "token_shape",
] as const;

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
        | "degrades_silently"
        | "surface_kind_mismatch"
        | "claim_contradicts_source"
        | "guard_unresolved"
        | "guard_symbol_unverified"
        | "absent_without_proof"
        | "reach_contradicts_row"
        | "entitlement_symbol_unverified"
        | "probe_symbol_unverified";
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

// Fallback ONLY, used when no schema document is supplied (a local run without
// --schema). The live values are read from the schema; see surfaceKindVocabulary.
//
// This set used to be the sole source of truth, and the pin bump to ops
// 45b28103a is what exposed that: the new contract added graphql_subscription
// to the schema's enum, and this gate rejected a row using it -- while the
// commit message for that very bump claimed the vocabularies were read live.
// They were, for `service`, and not for `surface_kind`. The claim was carried
// over from the sibling acr gate, where it is true. Same design, different
// implementation: the assertion did not transfer and nobody had checked it.
const SURFACE_KINDS_FALLBACK = new Set([
    "rest",
    "graphql_field",
    "graphql_mutation",
    "server_action",
]);
// "service" is NOT hardcoded here: it is read live from
// endpoint-profile.schema.json ($defs.endpointProfile.properties.service.enum)
// via loadServiceVocabulary/GateInputs.serviceVocabulary below, the same way
// the ops gate does -- a schema-level addition (a newly deployed app) is
// accepted with zero checker code change instead of being wrongly rejected.

/** A gaps entry that names primary_validator and says no rejecting check exists behind it. */
function gapsDiscloseMissingValidator(gapsText: string): boolean {
    return (
        /primary_validator/i.test(gapsText) &&
        (/no reject/i.test(gapsText) ||
            /does not reject/i.test(gapsText) ||
            /not currently enforced/i.test(gapsText) ||
            /degrades/i.test(gapsText) ||
            /NO REJECTING VALIDATOR/i.test(gapsText))
    );
}

export interface GateInputs {
    /** GUARD_SYMBOLS entries whose declaration is missing or no longer rejects (verifyGuardSymbols). */
    unverifiedGuardSymbols?: string[];
    /** ENTITLEMENT_SYMBOLS entries that are missing or no longer exit (verifyEntitlementSymbols). */
    unverifiedEntitlementSymbols?: string[];
    /** CACHE_SYMBOLS and RESOLVER_SYMBOLS entries that no longer resolve (verifyCacheSymbols, verifyResolverSymbols). */
    unverifiedProbeSymbols?: string[];
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

/** "" / "   " / [] / {}: present on the row but saying nothing, which is absent in all but name. */
function isEmptyValue(v: unknown): boolean {
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    if (v !== null && typeof v === "object") return Object.keys(v).length === 0;
    return false;
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
    // CHAOS-4792: the kind of a surface comes from discovery, never from the
    // row's own label. A row naming a discovered id with another surface_kind
    // is a violation, and the per-kind checks below key on this map.
    // CHAOS-4780: what discovery found about each surface's guard. A row's
    // protection claim is reconciled against it below.
    const guardedById = new Map<string, boolean>();
    for (const r of discoveredRoutes)
        if (r.guarded !== undefined)
            guardedById.set(`${r.method} ${r.route} [dev-health-web]`, r.guarded);
    for (const a of discoveredActions)
        if (a.guarded !== undefined) guardedById.set(a.id, a.guarded);
    for (const name of input.unverifiedGuardSymbols ?? []) {
        violations.push({
            rule: "guard_symbol_unverified",
            detail: `guard function ${name} is missing or its body no longer rejects on a missing session, so surfaces that call it are not proven guarded`,
        });
    }
    for (const name of input.unverifiedProbeSymbols ?? []) {
        violations.push({
            rule: "probe_symbol_unverified",
            detail: `${name} no longer resolves, so a call walk that does not reach it proves nothing for cache or resource_resolver`,
        });
    }
    for (const name of input.unverifiedEntitlementSymbols ?? []) {
        violations.push({
            rule: "entitlement_symbol_unverified",
            detail: `entitlement gate ${name} is missing or no longer rejects, so a call walk that does not reach it proves nothing`,
        });
    }
    // Call-walk verdicts per surface: the only evidence an advisory field may
    // be absent. A surface with no verdict (handler not resolved) proves nothing.
    const reachById = new Map<
        string,
        { entitlement?: Reach; credential?: Reach; cache?: Reach; resolver?: Reach }
    >();
    for (const r of discoveredRoutes) reachById.set(`${r.method} ${r.route} [dev-health-web]`, r);
    for (const a of discoveredActions) reachById.set(a.id, a);
    const unresolvedGuard = new Set<string>();
    for (const r of discoveredRoutes)
        if (r.guardUnresolved) unresolvedGuard.add(`${r.method} ${r.route} [dev-health-web]`);
    for (const a of discoveredActions) if (a.guardUnresolved) unresolvedGuard.add(a.id);
    const discoveredKind = new Map<string, "rest" | "server_action">();
    for (const id of discovered.keys()) {
        discoveredKind.set(id, id.startsWith("server_action:") ? "server_action" : "rest");
    }
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
        const guarded = row.service === "dev-health-web" ? guardedById.get(row.id) : undefined;
        if (unresolvedGuard.has(row.id)) {
            violations.push({
                rule: "guard_unresolved",
                id: row.id,
                detail: "guard discovery hit its call-depth bound for this surface, so its protection could not be established; it is never treated as guarded",
            });
        }
        if (guarded === true && row.classification === "public") {
            violations.push({
                rule: "claim_contradicts_source",
                id: row.id,
                detail: "row is classified public but source discovery finds a rejecting guard on this surface",
            });
        }
        if (guarded === true && row.primary_validator === null) {
            violations.push({
                rule: "claim_contradicts_source",
                id: row.id,
                detail: "row has primary_validator: null but source discovery finds a rejecting guard on this surface",
            });
        }
        if (guarded === false && row.classification === "protected") {
            const gapsText = Array.isArray(row.gaps) ? row.gaps.join("\n") : "";
            if (!gapsDiscloseMissingValidator(gapsText)) {
                violations.push({
                    rule: "claim_contradicts_source",
                    id: row.id,
                    detail: `row is classified protected but source discovery finds none of the known rejecting guards (${GUARD_SYMBOLS.map((s) => s.name).join(", ")}) on this surface, and gaps does not disclose it`,
                });
            }
        }
        const foundKind = discoveredKind.get(row.id);
        if (foundKind !== undefined && row.surface_kind !== foundKind) {
            violations.push({
                rule: "surface_kind_mismatch",
                id: row.id,
                detail: `row declares surface_kind "${row.surface_kind}" but source discovery finds this id as a ${foundKind} surface; a row cannot choose which checks apply to it`,
            });
        }

        const surfaceKinds = schemaDocument
            ? new Set(schemaEnumFrom(schemaDocument, "surface_kind") ?? [...SURFACE_KINDS_FALLBACK])
            : SURFACE_KINDS_FALLBACK;
        if (row.surface_kind && !surfaceKinds.has(row.surface_kind)) {
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

        // unstated_null: advisory fields. Absent = not applicable; null =
        // undetermined and needs a gaps entry that begins with "<field>:".
        // A substring match would let prose such as "transaction details"
        // excuse a null action.
        for (const field of ADVISORY_FIELDS) {
            if (!(field in row) || row[field] !== null) continue;
            const named =
                Array.isArray(row.gaps) &&
                row.gaps.some(
                    (g) => typeof g === "string" && g.trimStart().startsWith(`${field}:`),
                );
            if (!named) {
                violations.push({
                    rule: "unstated_null",
                    id: row.id,
                    detail: `${field} is null (undetermined) with no gaps entry beginning "${field}:"; use an absent field when it does not apply`,
                });
            }
        }

        // Absent needs a proof. entitlement_requirement and token_shape have a
        // call-walk predicate (cache and resolver need only the absent proof);
        // action and disclosure_behavior have none yet, so a row may not leave
        // them absent.
        {
            const reach = reachById.get(row.id);
            const predicate: Record<string, Reach | undefined> = {
                entitlement_requirement: reach?.entitlement,
                token_shape: reach?.credential,
                current_state_cache_behavior: reach?.cache,
                resource_resolver: reach?.resolver,
            };
            for (const field of ADVISORY_FIELDS) {
                const absent = !(field in row) || isEmptyValue(row[field]);
                const unset = absent || row[field] === null;
                const verdict = predicate[field];
                if (absent && verdict !== "not_reachable") {
                    violations.push({
                        rule: "absent_without_proof",
                        id: row.id,
                        detail: !(field in predicate)
                            ? `${field} is absent but no call-walk predicate exists for it; record null with a "${field}:" gaps entry`
                            : `${field} is absent but the call walk says ${verdict ?? "unresolved"}, not not_reachable; absent needs that proof`,
                    });
                }
                // cache and resolver values are prose the walk cannot derive: null
                // (undetermined, with its gaps entry) stays allowed when reachable.
                if (
                    unset &&
                    verdict === "reachable" &&
                    (field === "entitlement_requirement" || field === "token_shape")
                ) {
                    violations.push({
                        rule: "reach_contradicts_row",
                        id: row.id,
                        detail: `${field} is ${absent ? "absent" : "null"} but the call walk reaches its ${field === "token_shape" ? "credential read" : "entitlement gate"}; record the real value`,
                    });
                }
                if (field === "entitlement_requirement" && !unset && verdict === "not_reachable") {
                    violations.push({
                        rule: "reach_contradicts_row",
                        id: row.id,
                        detail: `entitlement_requirement is recorded but the call walk reaches no entitlement gate; the claim is unproven`,
                    });
                }
            }
        }

        // degrades_silently / unstated-null-primary_validator, only for the
        // surface kind + service this pass verified by hand: web server_actions.
        if (
            row.service === "dev-health-web" &&
            (foundKind ?? row.surface_kind) === "server_action" &&
            row.classification === "protected"
        ) {
            const gapsText = Array.isArray(row.gaps) ? row.gaps.join("\n") : "";
            const mentionsValidatorGap = gapsDiscloseMissingValidator(gapsText);

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
    return schemaEnumFrom(schemaDocument, "service");
}

/**
 * Reads $defs.endpointProfile.properties.<field>.enum LIVE from the ops-owned
 * schema document. Returns null when the schema has no enum for that field.
 */
function schemaEnumFrom(schemaDocument: unknown, field: string): string[] | null {
    if (!isPlainObject(schemaDocument)) return null;
    const defs = schemaDocument.$defs;
    if (!isPlainObject(defs)) return null;
    const profile = defs.endpointProfile;
    if (!isPlainObject(profile)) return null;
    const props = profile.properties;
    if (!isPlainObject(props)) return null;
    const node = props[field];
    if (!isPlainObject(node)) return null;
    const values = node.enum;
    if (!Array.isArray(values)) return null;
    return values.filter((v): v is string => typeof v === "string");
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
        unverifiedGuardSymbols: verifyGuardSymbols(root),
        unverifiedEntitlementSymbols: verifyEntitlementSymbols(root),
        unverifiedProbeSymbols: [...verifyCacheSymbols(root), ...verifyResolverSymbols(root)],
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
