import "server-only";
import { parseStrictJson } from "./strictjson";
import type { Jwk } from "./verify";

// Published key-set loader. Same rule as dev-health-go authverify/jwks.go parseJWKS:
// one invalid key or one repeated kid refuses the WHOLE set (no per-key trial), so a
// key set that two readers could read differently is never used.

export type KeySetResult = { ok: true; keys: Jwk[] } | { ok: false; reason: "invalid_jwks" };

const REFUSED: KeySetResult = { ok: false, reason: "invalid_jwks" };
const ED25519_PUBLIC_KEY_BYTES = 32;
const MAX_KID_CHARS = 256;
const B64URL = /^[A-Za-z0-9_-]+$/;

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(o).every((k) => allowed.includes(k));
}

function asKey(v: unknown): Jwk | null {
    if (!isObject(v) || !onlyKeys(v, ["kty", "crv", "kid", "use", "alg", "x"])) return null;
    const { kty, crv, kid, use, alg, x } = v;
    if (kty !== "OKP" || crv !== "Ed25519" || alg !== "EdDSA") return null;
    if (use !== undefined && use !== "" && use !== "sig") return null;
    if (typeof kid !== "string" || kid.trim() === "" || kid.length > MAX_KID_CHARS) return null;
    if (typeof x !== "string" || !B64URL.test(x)) return null;
    if (Buffer.from(x, "base64url").length !== ED25519_PUBLIC_KEY_BYTES) return null;
    return { kty, crv, alg, ...(use === "sig" ? { use } : {}), kid, x };
}

export function loadKeySet(text: string): KeySetResult {
    let doc: unknown;
    try {
        doc = parseStrictJson(text);
    } catch {
        return REFUSED;
    }
    if (
        !isObject(doc) ||
        !onlyKeys(doc, ["keys"]) ||
        !Array.isArray(doc.keys) ||
        doc.keys.length === 0
    )
        return REFUSED;
    const seen = new Set<string>();
    const keys: Jwk[] = [];
    for (const candidate of doc.keys) {
        const key = asKey(candidate);
        if (!key || seen.has(key.kid)) return REFUSED;
        seen.add(key.kid);
        keys.push(key);
    }
    return { ok: true, keys };
}
