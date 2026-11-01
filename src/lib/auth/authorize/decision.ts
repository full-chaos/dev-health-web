import "server-only";
import { parseStrictJson, StrictJsonError } from "../accesstoken/strictjson";

// authorization_decision.v1 and authorization_batch_response.v1 client rules
// (contracts/auth/v1/jsonschema, pinned from dev-health-ops). Pure: no I/O.
// Anything that is not a valid, unexpired, unambiguous decision is a refusal.

export const WIRE_REASON_CODES = [
    "allowed_by_repository_grant",
    "grant_absent",
    "repository_not_granted",
    "platform_role_absent",
] as const;
export type WireReasonCode = (typeof WIRE_REASON_CODES)[number];

export type ParseFailure =
    | "bad_json"
    | "duplicate_member"
    | "non_integer_number"
    | "service_error"
    | "bad_shape"
    | "unknown_reason"
    | "expired"
    | "batch_count_mismatch"
    | "batch_index_mismatch";

export type Assurance = "aal1" | "aal2" | "aal3";
export type Redaction = "personal_identifiers" | "contact_details" | "free_text";

export interface Obligations {
    tenantScope?: string;
    repositoryAllowlist?: readonly string[];
    redaction?: readonly Redaction[];
    minimumAssurance?: Assurance;
    stepUp?: boolean;
}

export interface Decision {
    decisionId: string;
    allowed: boolean;
    reasonCode: WireReasonCode;
    principalId: string;
    organizationId: string | null;
    policyRevision: number;
    expiresAtMs: number;
    obligations?: Obligations;
}

export type DecisionResult = { ok: true; decision: Decision } | { ok: false; reason: ParseFailure };
export type BatchResult =
    { ok: true; decisions: readonly Decision[] } | { ok: false; reason: ParseFailure };

const MAX_BATCH = 100;
const DECISION_ID = /^dec_[A-Za-z0-9_-]{26}$/;
const PRINCIPAL_ID = /^prn_[A-Za-z0-9_-]+$/;
const REPO_KEY = /^([a-z0-9][a-z0-9._-]{0,99}\/[a-z0-9][a-z0-9._-]{0,99}|\*)$/;
const EXPIRES_AT =
    /^([0-9]{3}[1-9]|[0-9]{2}[1-9][0-9]|[0-9][1-9][0-9]{2}|[1-9][0-9]{3})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])$/;
const REDACTIONS: readonly string[] = ["personal_identifiers", "contact_details", "free_text"];
const ASSURANCES: readonly string[] = ["aal1", "aal2", "aal3"];

class Refusal extends Error {
    readonly failure: ParseFailure;
    constructor(failure: ParseFailure) {
        super(failure);
        this.failure = failure;
    }
}
const refuse = (failure: ParseFailure): never => {
    throw new Refusal(failure);
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function onlyKeys(o: Obj, allowed: readonly string[]): void {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) refuse("bad_shape");
}

function parseText(text: string): unknown {
    try {
        return parseStrictJson(text);
    } catch (e) {
        if (e instanceof StrictJsonError) {
            if (e.kind === "duplicate_member") return refuse("duplicate_member");
            if (e.kind === "number") return refuse("non_integer_number");
        }
        return refuse("bad_json");
    }
}

function requireNotError(doc: Obj): void {
    if (doc.schema_version === "error.v1") refuse("service_error");
}

function parseObligations(v: unknown): Obligations {
    if (!isObj(v)) return refuse("bad_shape");
    onlyKeys(v, [
        "tenant_scope",
        "repository_allowlist",
        "redaction",
        "minimum_assurance",
        "step_up",
    ]);
    const out: Obligations = {};
    if ("tenant_scope" in v) {
        if (typeof v.tenant_scope !== "string" || v.tenant_scope === "") refuse("bad_shape");
        out.tenantScope = v.tenant_scope as string;
    }
    if ("repository_allowlist" in v) {
        const a = v.repository_allowlist;
        if (!Array.isArray(a) || new Set(a).size !== a.length) refuse("bad_shape");
        for (const k of a as unknown[])
            if (typeof k !== "string" || !REPO_KEY.test(k)) refuse("bad_shape");
        out.repositoryAllowlist = a as string[];
    }
    if ("redaction" in v) {
        const a = v.redaction;
        if (!Array.isArray(a) || new Set(a).size !== a.length) refuse("bad_shape");
        for (const k of a as unknown[])
            if (typeof k !== "string" || !REDACTIONS.includes(k)) refuse("bad_shape");
        out.redaction = a as Redaction[];
    }
    if ("minimum_assurance" in v) {
        if (typeof v.minimum_assurance !== "string" || !ASSURANCES.includes(v.minimum_assurance))
            refuse("bad_shape");
        out.minimumAssurance = v.minimum_assurance as Assurance;
    }
    if ("step_up" in v) {
        if (typeof v.step_up !== "boolean") refuse("bad_shape");
        out.stepUp = v.step_up as boolean;
    }
    return out;
}

function decisionFrom(doc: unknown, nowSeconds: number): Decision {
    if (!isObj(doc)) return refuse("bad_shape");
    requireNotError(doc);
    onlyKeys(doc, [
        "schema_version",
        "decision_id",
        "allowed",
        "reason_code",
        "principal_id",
        "organization_id",
        "policy_revision",
        "expires_at",
        "obligations",
    ]);
    if (doc.schema_version !== "authorization_decision.v1") refuse("bad_shape");
    if (typeof doc.decision_id !== "string" || !DECISION_ID.test(doc.decision_id))
        refuse("bad_shape");
    if (typeof doc.allowed !== "boolean") refuse("bad_shape");
    if (typeof doc.principal_id !== "string" || !PRINCIPAL_ID.test(doc.principal_id))
        refuse("bad_shape");
    const org = doc.organization_id;
    if (!(org === null || (typeof org === "string" && org !== ""))) refuse("bad_shape");
    const rev = doc.policy_revision;
    if (typeof rev !== "number" || !Number.isSafeInteger(rev) || rev < 0) refuse("bad_shape");
    if (typeof doc.expires_at !== "string" || !EXPIRES_AT.test(doc.expires_at)) refuse("bad_shape");
    const expiresAtMs = Date.parse(doc.expires_at as string);
    if (Number.isNaN(expiresAtMs)) refuse("bad_shape");
    if (typeof doc.reason_code !== "string") refuse("bad_shape");
    if (!(WIRE_REASON_CODES as readonly string[]).includes(doc.reason_code as string))
        refuse("unknown_reason");
    let obligations: Obligations | undefined;
    if ("obligations" in doc) {
        if (doc.allowed === false) refuse("bad_shape");
        obligations = parseObligations(doc.obligations);
    }
    if (expiresAtMs <= nowSeconds * 1000) refuse("expired");
    const decision: Decision = {
        decisionId: doc.decision_id as string,
        allowed: doc.allowed as boolean,
        reasonCode: doc.reason_code as WireReasonCode,
        principalId: doc.principal_id as string,
        organizationId: org as string | null,
        policyRevision: rev as number,
        expiresAtMs,
    };
    if (obligations) decision.obligations = obligations;
    return decision;
}

function guard<T>(run: () => T): { ok: true; value: T } | { ok: false; reason: ParseFailure } {
    try {
        return { ok: true, value: run() };
    } catch (e) {
        return { ok: false, reason: e instanceof Refusal ? e.failure : "bad_shape" };
    }
}

export function parseDecision(text: string, nowSeconds: number): DecisionResult {
    const r = guard(() => decisionFrom(parseText(text), nowSeconds));
    return r.ok ? { ok: true, decision: r.value } : r;
}

export function parseBatch(text: string, count: number, nowSeconds: number): BatchResult {
    const r = guard(() => {
        const doc = parseText(text);
        if (!isObj(doc)) return refuse("bad_shape");
        requireNotError(doc);
        onlyKeys(doc, ["schema_version", "decisions"]);
        if (doc.schema_version !== "authorization_batch_response.v1") refuse("bad_shape");
        const items = doc.decisions;
        if (!Array.isArray(items) || items.length < 1 || items.length > MAX_BATCH)
            refuse("bad_shape");
        const list = items as unknown[];
        if (list.length !== count) refuse("batch_count_mismatch");
        const out: Decision[] = [];
        list.forEach((it, position) => {
            if (!isObj(it)) return refuse("bad_shape");
            onlyKeys(it, ["index", "decision"]);
            if (typeof it.index !== "number" || !Number.isSafeInteger(it.index))
                refuse("bad_shape");
            if (it.index !== position) refuse("batch_index_mismatch");
            out.push(decisionFrom(it.decision, nowSeconds));
        });
        return out;
    });
    return r.ok ? { ok: true, decisions: r.value } : r;
}
