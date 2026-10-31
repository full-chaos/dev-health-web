// Closed-form checks that mirror contracts/auth/v1/jsonschema/access-token.v1.schema.json
// (pinned from dev-health-ops). The corpus test proves they agree with the schema.

export const AUDIENCE_SCOPES: Readonly<Record<string, string>> = {
    "dev-health-api": "api:access",
    "auth-service": "auth:session",
};

export interface AccessTokenHeader {
    alg: "EdDSA";
    typ: "at+jwt";
    kid: string;
}

export interface AccessTokenClaims {
    iss: string;
    aud: string;
    sub: string;
    principal_type: "human";
    sid: string;
    jti: string;
    iat: number;
    nbf: number;
    exp: number;
    org_id?: string;
    scope: string;
}

const KID = /^[!-~]{1,256}$/;
const ISSUER =
    /^https:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?(\/[A-Za-z0-9_~-][A-Za-z0-9._~-]{0,63}){0,8}$/;
const SUB = /^prn_[A-Za-z0-9_-]+$/;
const SID = /^ses_[A-Za-z0-9_-]{22,64}$/;
const JTI = /^[A-Za-z0-9_-]{22,64}$/;
const ORG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NUMERIC_DATE = 253402300799;

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function exactKeys(
    o: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
): boolean {
    const keys = Object.keys(o);
    return (
        required.every((k) => keys.includes(k)) &&
        keys.every((k) => required.includes(k) || optional.includes(k))
    );
}

const isString = (v: unknown, re: RegExp): v is string => typeof v === "string" && re.test(v);
const isDate = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_NUMERIC_DATE;

export function asHeader(v: unknown): AccessTokenHeader | null {
    if (!isObject(v) || !exactKeys(v, ["alg", "typ", "kid"], [])) return null;
    if (v.alg !== "EdDSA" || v.typ !== "at+jwt" || !isString(v.kid, KID)) return null;
    return { alg: "EdDSA", typ: "at+jwt", kid: v.kid };
}

export function asClaims(v: unknown): AccessTokenClaims | null {
    if (
        !isObject(v) ||
        !exactKeys(
            v,
            ["iss", "aud", "sub", "principal_type", "sid", "jti", "iat", "nbf", "exp", "scope"],
            ["org_id"],
        )
    ) {
        return null;
    }
    const { iss, aud, sub, principal_type, sid, jti, iat, nbf, exp, scope, org_id } = v;
    if (!isString(iss, ISSUER) || typeof aud !== "string" || !Object.hasOwn(AUDIENCE_SCOPES, aud))
        return null;
    if (
        !isString(sub, SUB) ||
        principal_type !== "human" ||
        !isString(sid, SID) ||
        !isString(jti, JTI)
    )
        return null;
    if (!isDate(iat) || !isDate(nbf) || !isDate(exp)) return null;
    if (scope !== AUDIENCE_SCOPES[aud]) return null;
    if (org_id !== undefined && !isString(org_id, ORG)) return null;
    return {
        iss,
        aud,
        sub,
        principal_type: "human",
        sid,
        jti,
        iat,
        nbf,
        exp,
        scope,
        ...(org_id === undefined ? {} : { org_id }),
    };
}
