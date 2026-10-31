import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    readAccessToken,
    readSessionAccessToken,
    resolveTokenClass,
    type AccessTokenOk,
} from "@/lib/authServiceClient";
import type { Jwk, VerifyContext } from "@/lib/auth/accesstoken/verify";

const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) =>
    Buffer.from(typeof b === "string" ? enc.encode(b) : b).toString("base64url");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const jwk = {
    ...publicKey.export({ format: "jwk" }),
    alg: "EdDSA",
    use: "sig",
    kid: "test-kid-1",
} as unknown as Jwk;

const ctx: VerifyContext = {
    issuer: "https://auth.example.test",
    audience: "dev-health-api",
    nowSeconds: 1760000300,
    publishedKeys: [jwk],
    removedKids: [],
};

const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const EXP = 1760000600;

function claimsOf(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
        iss: "https://auth.example.test",
        aud: "dev-health-api",
        sub: SUB,
        principal_type: "human",
        sid: SID,
        jti: "000000000000000000000001",
        iat: 1760000000,
        nbf: 1760000000,
        exp: EXP,
        scope: "api:access",
        ...over,
    });
}

function eddsaToken(over: Record<string, unknown> = {}, header?: string): string {
    const h = header ?? '{"alg":"EdDSA","typ":"at+jwt","kid":"test-kid-1"}';
    const p = claimsOf(over);
    const input = `${b64u(h)}.${b64u(p)}`;
    return `${input}.${b64u(sign(null, Buffer.from(input), privateKey))}`;
}

const serviceToken = (over: Record<string, unknown> = {}) =>
    eddsaToken({ aud: "auth-service", scope: "auth:session", ...over });

function unsigned(header: string, payload: string): string {
    return `${b64u(header)}.${b64u(payload)}.${b64u("sig")}`;
}
const hs256Token = (over: Record<string, unknown> = {}) =>
    unsigned(
        '{"alg":"HS256","typ":"JWT"}',
        JSON.stringify({ sub: "u1", sid: SID, exp: EXP, ...over }),
    );

const verifiedAccess = (): AccessTokenOk => {
    const got = readAccessToken(eddsaToken(), "eddsa", ctx);
    if (!got.ok) throw new Error("fixture access token must verify");
    return got;
};

describe("resolveTokenClass (AUTH_ACCESS_TOKEN_CLASS, server config)", () => {
    it("unset equals hs256_compat", () => {
        expect(resolveTokenClass(undefined)).toBe("hs256_compat");
        expect(resolveTokenClass("")).toBe("hs256_compat");
    });
    it("reads the two closed values", () => {
        expect(resolveTokenClass("eddsa")).toBe("eddsa");
        expect(resolveTokenClass("hs256_compat")).toBe("hs256_compat");
    });
    it("unknown value refused", () => {
        for (const raw of ["EdDSA", "hs256", "none", " eddsa", "eddsa ", "rs256"]) {
            expect(resolveTokenClass(raw), raw).toBeNull();
        }
    });
});

describe("readAccessToken", () => {
    it("class eddsa: verifies the access token and stores sid and exp from the verified claims", () => {
        const got = readAccessToken(eddsaToken(), "eddsa", ctx);
        expect(got).toMatchObject({ ok: true, verified: true, sid: SID, sub: SUB, exp: EXP });
    });

    it("class eddsa: a verify failure is terminal", () => {
        const forged = eddsaToken().replace(/.$/, (c) => (c === "A" ? "B" : "A"));
        expect(readAccessToken(forged, "eddsa", ctx)).toEqual({ ok: false, reason: "verify" });
        expect(readAccessToken(eddsaToken({ exp: 1 }), "eddsa", ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
        expect(readAccessToken("a.b", "eddsa", ctx)).toEqual({ ok: false, reason: "verify" });
    });

    it("class eddsa: a service-audience token in the access slot is refused", () => {
        expect(readAccessToken(serviceToken(), "eddsa", ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
    });

    it("class hs256_compat: reads exp and sid by decode and marks the result unverified", () => {
        const got = readAccessToken(hs256Token(), "hs256_compat", ctx);
        expect(got).toMatchObject({ ok: true, verified: false, sid: SID, exp: EXP });
    });

    it("class hs256_compat: a payload without exp or sid still reads, with those fields absent", () => {
        const got = readAccessToken(
            unsigned('{"alg":"HS256"}', '{"sub":"u1"}'),
            "hs256_compat",
            ctx,
        );
        expect(got).toMatchObject({ ok: true, verified: false });
        expect(got).not.toHaveProperty("exp");
        expect(got).not.toHaveProperty("sid");
    });

    it("class hs256_compat: a service-audience token in the access slot is refused", () => {
        const got = readAccessToken(hs256Token({ aud: "auth-service" }), "hs256_compat", ctx);
        expect(got).toEqual({ ok: false, reason: "shape" });
    });

    it("mismatch: an EdDSA-alg token under class hs256_compat is refused", () => {
        expect(readAccessToken(eddsaToken(), "hs256_compat", ctx)).toEqual({
            ok: false,
            reason: "shape",
        });
    });

    it("mismatch: an HS256-alg token under class eddsa is refused", () => {
        expect(readAccessToken(hs256Token(), "eddsa", ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
    });

    it("alg none and unknown alg are refused in both classes", () => {
        for (const alg of ["none", "RS256", "ES256", "HS512", "hs256", ""]) {
            const tok = unsigned(JSON.stringify({ alg, typ: "JWT" }), JSON.stringify({ exp: EXP }));
            expect(readAccessToken(tok, "hs256_compat", ctx).ok, `hs256_compat ${alg}`).toBe(false);
            expect(readAccessToken(tok, "eddsa", ctx).ok, `eddsa ${alg}`).toBe(false);
        }
        const noAlg = unsigned('{"typ":"JWT"}', JSON.stringify({ exp: EXP }));
        expect(readAccessToken(noAlg, "hs256_compat", ctx).ok).toBe(false);
    });

    it("EdDSA token with unset class refused", () => {
        const cls = resolveTokenClass(undefined);
        expect(cls).not.toBeNull();
        expect(readAccessToken(eddsaToken(), cls ?? "hs256_compat", ctx).ok).toBe(false);
    });

    it("the expected class comes from server config, not from the token header", () => {
        // A header that claims EdDSA cannot move a token into the eddsa path, and the reverse.
        expect(readAccessToken(eddsaToken(), "hs256_compat", ctx).ok).toBe(false);
        expect(readAccessToken(hs256Token(), "eddsa", ctx).ok).toBe(false);
        expect(readAccessToken(hs256Token(), "hs256_compat", ctx).ok).toBe(true);
        expect(readAccessToken(eddsaToken(), "eddsa", ctx).ok).toBe(true);
    });

    it("the HS256 secret is never read by web code", () => {
        const files = [
            "src/lib/authServiceClient.ts",
            "src/lib/auth/accesstoken/keyset.ts",
            "src/lib/auth/accesstoken/verify.ts",
        ];
        for (const file of files) {
            const text = readFileSync(path.resolve(__dirname, "../../..", file), "utf8");
            expect(text, file).not.toMatch(/JWT_SECRET|createHmac|process\.env/);
        }
    });

    it("verified act is kept apart from sub and never merged into id or org", () => {
        const act = "prn_BBBBBBBBBBBBBBBBBBBBBB";
        const got = readAccessToken(eddsaToken({ act: { sub: act } }), "eddsa", ctx);
        expect(got).toMatchObject({ ok: true, sub: SUB, actor: act });
        expect(readAccessToken(eddsaToken(), "eddsa", ctx)).toMatchObject({
            ok: true,
            actor: null,
        });
        if (got.ok) expect(JSON.stringify({ sub: got.sub, org: got.orgId })).not.toContain(act);
    });
});

describe("readSessionAccessToken", () => {
    it("field absent under hs256_compat keeps today's path", () => {
        const access = readAccessToken(hs256Token(), "hs256_compat", ctx);
        if (!access.ok) throw new Error("fixture");
        expect(readSessionAccessToken(undefined, access, "hs256_compat", ctx)).toEqual({
            kind: "absent",
        });
    });

    it("field present under hs256_compat is ignored and never stored", () => {
        const access = readAccessToken(hs256Token(), "hs256_compat", ctx);
        if (!access.ok) throw new Error("fixture");
        for (const value of [serviceToken(), "garbage", 7, null, ""]) {
            expect(readSessionAccessToken(value, access, "hs256_compat", ctx)).toEqual({
                kind: "ignored",
            });
        }
    });

    it("class eddsa: stores the session access token and its exp", () => {
        const tok = serviceToken();
        expect(readSessionAccessToken(tok, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "ok",
            token: tok,
            exp: EXP,
            sid: SID,
        });
    });

    it("class eddsa: an absent field is accepted as absent", () => {
        expect(readSessionAccessToken(undefined, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "absent",
        });
    });

    it("class eddsa: a token with the wrong audience is refused", () => {
        const wrong = eddsaToken();
        expect(readSessionAccessToken(wrong, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("class eddsa: a token that fails verification is malformed", () => {
        const forged = serviceToken().replace(/.$/, (c) => (c === "A" ? "B" : "A"));
        expect(readSessionAccessToken(forged, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("class eddsa: a different sid than the access token is malformed", () => {
        const other = serviceToken({ sid: "ses_AAAAAAAAAAAAAAAAAAAABB" });
        expect(readSessionAccessToken(other, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "sid_mismatch",
        });
    });

    it("class eddsa: a different sub than the access token is malformed", () => {
        const other = serviceToken({ sub: "prn_CCCCCCCCCCCCCCCCCCCCCC" });
        expect(readSessionAccessToken(other, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "sub_mismatch",
        });
    });

    it("class eddsa: an exp that differs from the access token's is malformed (must equal)", () => {
        const later = serviceToken({ exp: EXP + 1 });
        const earlier = serviceToken({ exp: EXP - 1 });
        expect(readSessionAccessToken(later, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "exp_mismatch",
        });
        expect(readSessionAccessToken(earlier, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "exp_mismatch",
        });
    });

    it("class eddsa: a non-EdDSA alg is refused", () => {
        const hs = unsigned('{"alg":"HS256","typ":"JWT"}', JSON.stringify({ aud: "auth-service" }));
        expect(readSessionAccessToken(hs, verifiedAccess(), "eddsa", ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("class eddsa: a non-string or empty value is malformed", () => {
        for (const value of ["", 7, null, {}, [], true]) {
            expect(readSessionAccessToken(value, verifiedAccess(), "eddsa", ctx)).toEqual({
                kind: "refused",
                reason: "malformed",
            });
        }
    });

    it("refusal answers carry a closed reason and never token text", () => {
        const tok = serviceToken({ sid: "ses_AAAAAAAAAAAAAAAAAAAABB" });
        const got = readSessionAccessToken(tok, verifiedAccess(), "eddsa", ctx);
        expect(JSON.stringify(got)).not.toContain(tok.slice(0, 20));
        expect(Object.keys(got).sort()).toEqual(["kind", "reason"]);
    });
});

describe("readAccessToken, class hs256_compat: aud is a closed shape", () => {
    const read = (aud?: unknown) =>
        readAccessToken(hs256Token(aud === undefined ? {} : { aud }), "hs256_compat", ctx);

    it("refuses an aud array that holds auth-service, in any position", () => {
        const refused = [
            ["auth-service"],
            ["auth-service", "dev-health-api"],
            ["dev-health-api", "auth-service", "other"],
            ["dev-health-api", "other", "auth-service"],
        ];
        for (const aud of refused) {
            expect(read(aud), JSON.stringify(aud)).toEqual({ ok: false, reason: "shape" });
        }
    });

    it("refuses a scalar auth-service aud", () => {
        expect(read("auth-service")).toEqual({ ok: false, reason: "shape" });
    });

    it("refuses an aud that is not a string or an array of strings", () => {
        for (const aud of [
            7,
            true,
            null,
            {},
            { a: "auth-service" },
            ["dev-health-api", 7],
            [null],
            [["auth-service"]],
        ]) {
            expect(read(aud), JSON.stringify(aud)).toEqual({ ok: false, reason: "shape" });
        }
    });

    it("accepts a scalar dev-health-api aud, an array without auth-service, and no aud", () => {
        for (const aud of [
            "dev-health-api",
            ["dev-health-api"],
            ["dev-health-api", "other"],
            [],
            undefined,
        ]) {
            expect(read(aud), JSON.stringify(aud)).toMatchObject({ ok: true, verified: false });
        }
    });
});
