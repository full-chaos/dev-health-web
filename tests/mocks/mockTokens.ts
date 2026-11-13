import { createPrivateKey, createPublicKey, sign } from "node:crypto";

// The access tokens the ops mock answers with. EdDSA is the only access-token class: a mock token is
// a real access-token.v1 token (alg EdDSA, typ at+jwt) signed with the TEST-ONLY key below, and the
// mock serves the matching discovery document and key set. The seed is a public constant of this
// repository, not a secret; nothing but the mock trusts its key.
const TEST_ONLY_SEED = Buffer.alloc(32, "dev-health-web e2e mock key. test only.");
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, TEST_ONLY_SEED]),
    format: "der",
    type: "pkcs8",
});

/** The issuer the e2e web server pins. The e2e preload sends its reads to the mock origin. */
export const MOCK_ISSUER = "https://auth.e2e.test";
export const MOCK_KID = "mock-kid-1";
const LIFETIME_SECONDS = 3600;

export type MockWho = "admin" | "member" | "refreshed";

const PRINCIPALS: Record<MockWho, { sub: string; sid: string }> = {
    admin: { sub: "prn_MockAdminAAAAAAAAAAAAAA", sid: "ses_MockAdminSessionAAAAAAAAAAAA" },
    member: { sub: "prn_MockMemberAAAAAAAAAAAAA", sid: "ses_MockMemberSessionAAAAAAAAAAA" },
    refreshed: {
        sub: "prn_MockRefreshedAAAAAAAAAAA",
        sid: "ses_MockRefreshedSessionAAAAAAAAA",
    },
};

const b64u = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");

export interface MockTokenOptions {
    /** Seconds since the epoch; both tokens of one answer must use the same value. */
    readonly now?: number;
    readonly kid?: string;
    readonly act?: string;
    /** Seconds from `now` to `exp`; default 3600. */
    readonly lifetime?: number;
}

function mint(
    who: MockWho,
    audience: "dev-health-api" | "auth-service",
    options: MockTokenOptions,
): string {
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const { sub, sid } = PRINCIPALS[who];
    const header = JSON.stringify({
        alg: "EdDSA",
        typ: "at+jwt",
        kid: options.kid ?? MOCK_KID,
    });
    const payload = JSON.stringify({
        iss: MOCK_ISSUER,
        aud: audience,
        sub,
        principal_type: "human",
        sid,
        jti: b64u(`${who}-${audience}-${now}`).slice(0, 40).padEnd(22, "A"),
        iat: now,
        nbf: now,
        exp: now + (options.lifetime ?? LIFETIME_SECONDS),
        ...(options.act === undefined ? {} : { act: { sub: options.act } }),
        scope: audience === "auth-service" ? "auth:session" : "api:access",
    });
    const input = `${b64u(header)}.${b64u(payload)}`;
    return `${input}.${b64u(sign(null, Buffer.from(input), privateKey))}`;
}

export const mockAccessToken = (who: MockWho, options: MockTokenOptions = {}) =>
    mint(who, "dev-health-api", options);

export const mockSessionToken = (who: MockWho, options: MockTokenOptions = {}) =>
    mint(who, "auth-service", options);

/** The two tokens of one answer, minted at one instant so their expiries are equal. */
export function mockPair(who: MockWho): {
    access_token: string;
    session_access_token: string;
} {
    const now = Math.floor(Date.now() / 1000);
    return {
        access_token: mockAccessToken(who, { now }),
        session_access_token: mockSessionToken(who, { now }),
    };
}

/** An admin pair web refreshes at once: it ends 301 s from now, inside the 5 min refresh window. */
export function mockExpiringPair(nowSeconds: number = Math.floor(Date.now() / 1000)): {
    access_token: string;
    session_access_token: string;
} {
    return {
        access_token: mockAccessToken("admin", { now: nowSeconds, lifetime: 301 }),
        session_access_token: mockSessionToken("admin", { now: nowSeconds, lifetime: 301 }),
    };
}

export function mockJwks(): { keys: Record<string, unknown>[] } {
    const { x } = createPublicKey(privateKey).export({ format: "jwk" });
    return {
        keys: [{ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", kid: MOCK_KID, x }],
    };
}

export function mockDiscovery(): Record<string, unknown> {
    return {
        issuer: MOCK_ISSUER,
        jwks_uri: `${MOCK_ISSUER}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ["EdDSA"],
    };
}
