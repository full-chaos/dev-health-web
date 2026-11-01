import { generateKeyPairSync, sign } from "node:crypto";

// Test support: an eddsa auth-service in a fetch mock. It signs access tokens (aud dev-health-api) and
// service session tokens (aud auth-service) with one run-time key pair, and serves the discovery
// document and the key set the key source reads. No key material is kept in the repository.

export const ISSUER = "https://auth.example.test";
export const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
export const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
export const ACTOR = "prn_BBBBBBBBBBBBBBBBBBBBBB";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const b64 = (s: string) => Buffer.from(s).toString("base64url");

export interface MintOptions {
    aud?: "dev-health-api" | "auth-service";
    exp?: number;
    sid?: string;
    sub?: string;
    act?: string;
    kid?: string;
    pad?: number;
}

/** Seconds since the epoch, `ahead` seconds from now. */
export const inSeconds = (ahead: number): number => Math.floor(Date.now() / 1000) + ahead;

export function mint(opts: MintOptions = {}): string {
    const aud = opts.aud ?? "dev-health-api";
    const nowS = Math.floor(Date.now() / 1000);
    const header = b64(JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid: opts.kid ?? "kid-1" }));
    const payload = b64(
        JSON.stringify({
            iss: ISSUER,
            aud,
            sub: opts.sub ?? SUB,
            principal_type: "human",
            sid: opts.sid ?? SID,
            jti: "000000000000000000000001",
            iat: nowS - 10,
            nbf: nowS - 10,
            exp: opts.exp ?? nowS + 3000,
            scope: aud === "auth-service" ? "auth:session" : "api:access",
            ...(opts.act === undefined ? {} : { act: { sub: opts.act } }),
        }),
    );
    const input = `${header}.${payload}`;
    return `${input}.${Buffer.from(sign(null, Buffer.from(input), privateKey)).toString("base64url")}`;
}

export const discoveryResponse = () =>
    new Response(
        JSON.stringify({
            issuer: ISSUER,
            jwks_uri: `${ISSUER}/.well-known/jwks.json`,
            id_token_signing_alg_values_supported: ["EdDSA"],
        }),
    );

export const keysResponse = () =>
    new Response(
        JSON.stringify({
            keys: [
                {
                    kty: "OKP",
                    crv: "Ed25519",
                    alg: "EdDSA",
                    use: "sig",
                    kid: "kid-1",
                    x: publicKey.export({ format: "jwk" }).x,
                },
            ],
        }),
    );

/** A fetch implementation: the discovery and key-set URLs, plus the given routes (by URL suffix). */
export function eddsaFetch(
    routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    return async (input, init) => {
        const url = String(input);
        if (url === `${ISSUER}/.well-known/openid-configuration`) return discoveryResponse();
        if (url === `${ISSUER}/.well-known/jwks.json`) return keysResponse();
        for (const [suffix, handler] of Object.entries(routes)) {
            if (url.endsWith(suffix)) return handler(init);
        }
        throw new Error(`unexpected fetch ${url}`);
    };
}
