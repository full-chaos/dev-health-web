import "server-only";
import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { asClaims, asHeader, type AccessTokenClaims } from "./claims";
import { parseStrictJson, StrictJsonError } from "./strictjson";

// access-token.v1 server verifier. Pure: no I/O, no logging. It decides in the
// order the pinned corpus manifest names (decision_order) and fails closed.

// exp - iat ceiling: AccessTokenLifetimeCeiling in dev-health-ops
// internal/auth/contracts; the corpus test ties this value to the pinned vectors.
export const ACCESS_TOKEN_LIFETIME_CEILING_SECONDS = 3600;
// Pinned manifest leeway_seconds; the corpus test ties this value to it.
export const LEEWAY_SECONDS = 0;

export const MAX_HEADER_BYTES = 1024;
export const MAX_PAYLOAD_BYTES = 2048;
export const MAX_SIGNATURE_BYTES = 64;
export const MAX_COMPACT_BYTES = 4096;

export interface Jwk {
    kty: string;
    crv: string;
    alg?: string;
    use?: string;
    kid: string;
    x: string;
}

export interface VerifyContext {
    issuer: string;
    audience: string;
    nowSeconds: number;
    publishedKeys: readonly Jwk[];
    removedKids: readonly string[];
}

export interface TokenParts {
    header: Uint8Array;
    payload: Uint8Array;
    signature: Uint8Array;
}

export type RefusalReason =
    "contract" | "unknown_kid" | "signature" | "issuer" | "audience" | "not_yet_valid" | "expired";

export type ContractStage = "size" | "framing" | "schema" | "duplicate_member" | "client_rule";

export type VerifyResult =
    | { ok: true; claims: AccessTokenClaims; actor: string | null }
    | { ok: false; reason: RefusalReason; stage?: ContractStage };

const contract = (stage: ContractStage): VerifyResult => ({ ok: false, reason: "contract", stage });
const refuse = (reason: Exclude<RefusalReason, "contract">): VerifyResult => ({
    ok: false,
    reason,
});

const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

function decodeUtf8(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
        return null;
    }
}

function parseDoc(text: string | null): { value?: unknown; error?: "duplicate_member" | "schema" } {
    if (text === null) return { error: "schema" };
    try {
        return { value: parseStrictJson(text) };
    } catch (e) {
        if (e instanceof StrictJsonError)
            return { error: e.kind === "duplicate_member" ? "duplicate_member" : "schema" };
        return { error: "schema" };
    }
}

function importKey(key: Jwk): KeyObject | null {
    if (key.kty !== "OKP" || key.crv !== "Ed25519") return null;
    try {
        return createPublicKey({ key: { kty: key.kty, crv: key.crv, x: key.x }, format: "jwk" });
    } catch {
        return null;
    }
}

export function verifyAccessToken(parts: TokenParts, ctx: VerifyContext): VerifyResult {
    if (
        parts.header.length > MAX_HEADER_BYTES ||
        parts.payload.length > MAX_PAYLOAD_BYTES ||
        parts.signature.length > MAX_SIGNATURE_BYTES
    ) {
        return contract("size");
    }

    const h = parseDoc(decodeUtf8(parts.header));
    const p = parseDoc(decodeUtf8(parts.payload));
    if (h.error === "duplicate_member" || p.error === "duplicate_member")
        return contract("duplicate_member");
    if (h.error || p.error) return contract("schema");
    const header = asHeader(h.value);
    const claims = asClaims(p.value);
    if (!header || !claims) return contract("schema");
    if (
        claims.nbf < claims.iat ||
        claims.exp <= claims.nbf ||
        claims.exp - claims.iat > ACCESS_TOKEN_LIFETIME_CEILING_SECONDS
    ) {
        return contract("client_rule");
    }

    if (ctx.removedKids.includes(header.kid)) return refuse("unknown_kid");
    const jwk = ctx.publishedKeys.find((k) => k.kid === header.kid);
    const key = jwk ? importKey(jwk) : null;
    if (!key) return refuse("unknown_kid");

    const signingInput = Buffer.from(`${b64url(parts.header)}.${b64url(parts.payload)}`);
    let signatureOk = false;
    if (parts.signature.length === MAX_SIGNATURE_BYTES) {
        try {
            signatureOk = cryptoVerify(null, signingInput, key, parts.signature);
        } catch {
            signatureOk = false;
        }
    }
    if (!signatureOk) return refuse("signature");

    if (claims.iss !== ctx.issuer) return refuse("issuer");
    if (claims.aud !== ctx.audience) return refuse("audience");
    if (ctx.nowSeconds + LEEWAY_SECONDS < claims.nbf) return refuse("not_yet_valid");
    if (ctx.nowSeconds >= claims.exp + LEEWAY_SECONDS) return refuse("expired");
    return { ok: true, claims, actor: claims.act?.sub ?? null };
}

const B64URL = /^[A-Za-z0-9_-]+$/;

export function verifyCompactAccessToken(token: string, ctx: VerifyContext): VerifyResult {
    if (token.length > MAX_COMPACT_BYTES) return contract("size");
    const segments = token.split(".");
    if (segments.length !== 3 || !segments.every((s) => B64URL.test(s))) return contract("framing");
    const [header, payload, signature] = segments.map(
        (s) => new Uint8Array(Buffer.from(s, "base64url")),
    );
    if (
        b64url(header) !== segments[0] ||
        b64url(payload) !== segments[1] ||
        b64url(signature) !== segments[2]
    ) {
        return contract("framing");
    }
    return verifyAccessToken({ header, payload, signature }, ctx);
}
