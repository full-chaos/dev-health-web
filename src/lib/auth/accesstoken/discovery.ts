import "server-only";
import { parseStrictJson } from "./strictjson";

// discovery.v1 client rules (contracts/auth/v1/jsonschema/discovery.v1.schema.json, pinned from
// dev-health-ops). The schema fixes the shape; three rules compare, so they live here: the issuer
// must be the pinned one, and jwks_uri must be exactly issuer + the fixed path.

export type DiscoveryResult = { ok: true; jwksUri: string } | { ok: false };

const REFUSED: DiscoveryResult = { ok: false };
const JWKS_PATH = "/.well-known/jwks.json";
const ISSUER =
    /^https:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?(\/[A-Za-z0-9_~-][A-Za-z0-9._~-]{0,63}){0,8}$/;

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseDiscovery(text: string, pinnedIssuer: string): DiscoveryResult {
    if (!ISSUER.test(pinnedIssuer)) return REFUSED;
    let doc: unknown;
    try {
        doc = parseStrictJson(text);
    } catch {
        return REFUSED;
    }
    if (!isObject(doc)) return REFUSED;
    const keys = Object.keys(doc).sort();
    if (keys.join(",") !== "id_token_signing_alg_values_supported,issuer,jwks_uri") return REFUSED;
    const { issuer, jwks_uri: jwksUri, id_token_signing_alg_values_supported: algs } = doc;
    if (typeof issuer !== "string" || !ISSUER.test(issuer) || issuer !== pinnedIssuer)
        return REFUSED;
    if (jwksUri !== `${issuer}${JWKS_PATH}`) return REFUSED;
    if (!Array.isArray(algs) || algs.length !== 1 || algs[0] !== "EdDSA") return REFUSED;
    return { ok: true, jwksUri };
}
