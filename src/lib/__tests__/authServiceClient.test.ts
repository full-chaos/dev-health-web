import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    readAccessToken,
    readSessionAccessToken,
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
    const got = readAccessToken(eddsaToken(), ctx);
    if (!got.ok) throw new Error("fixture access token must verify");
    return got;
};

describe("readAccessToken", () => {
    it("verifies the access token and stores sid and exp from the verified claims", () => {
        const got = readAccessToken(eddsaToken(), ctx);
        expect(got).toMatchObject({ ok: true, verified: true, sid: SID, sub: SUB, exp: EXP });
    });

    it("a verify failure is terminal", () => {
        const forged = eddsaToken().replace(/.$/, (c) => (c === "A" ? "B" : "A"));
        expect(readAccessToken(forged, ctx)).toEqual({ ok: false, reason: "verify" });
        expect(readAccessToken(eddsaToken({ exp: 1 }), ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
        expect(readAccessToken("a.b", ctx)).toEqual({ ok: false, reason: "verify" });
    });

    it("a service-audience token in the access slot is refused", () => {
        expect(readAccessToken(serviceToken(), ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
    });

    it("an HS256-alg token is refused", () => {
        expect(readAccessToken(hs256Token(), ctx)).toEqual({
            ok: false,
            reason: "verify",
        });
    });

    it("alg none and unknown alg are refused", () => {
        for (const alg of ["none", "RS256", "ES256", "HS256", "HS512", "hs256", ""]) {
            const tok = unsigned(JSON.stringify({ alg, typ: "JWT" }), JSON.stringify({ exp: EXP }));
            expect(readAccessToken(tok, ctx).ok, alg).toBe(false);
        }
        const noAlg = unsigned('{"typ":"JWT"}', JSON.stringify({ exp: EXP }));
        expect(readAccessToken(noAlg, ctx).ok).toBe(false);
    });

    it("an HS256 token is refused, whatever its claims say", () => {
        expect(readAccessToken(hs256Token(), ctx)).toEqual({ ok: false, reason: "verify" });
        expect(readAccessToken(hs256Token({ aud: "dev-health-api" }), ctx).ok).toBe(false);
        expect(readAccessToken(hs256Token({ aud: ["dev-health-api"] }), ctx).ok).toBe(false);
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
        const got = readAccessToken(eddsaToken({ act: { sub: act } }), ctx);
        expect(got).toMatchObject({ ok: true, sub: SUB, actor: act });
        expect(readAccessToken(eddsaToken(), ctx)).toMatchObject({
            ok: true,
            actor: null,
        });
        if (got.ok) expect(JSON.stringify({ sub: got.sub, org: got.orgId })).not.toContain(act);
    });
});

describe("readSessionAccessToken", () => {
    it("stores the session access token and its exp", () => {
        const tok = serviceToken();
        expect(readSessionAccessToken(tok, verifiedAccess(), ctx)).toEqual({
            kind: "ok",
            token: tok,
            exp: EXP,
            sid: SID,
        });
    });

    it("an absent field is accepted as absent", () => {
        expect(readSessionAccessToken(undefined, verifiedAccess(), ctx)).toEqual({
            kind: "absent",
        });
    });

    it("a token with the wrong audience is refused", () => {
        const wrong = eddsaToken();
        expect(readSessionAccessToken(wrong, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("a token that fails verification is malformed", () => {
        const forged = serviceToken().replace(/.$/, (c) => (c === "A" ? "B" : "A"));
        expect(readSessionAccessToken(forged, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("a different sid than the access token is malformed", () => {
        const other = serviceToken({ sid: "ses_AAAAAAAAAAAAAAAAAAAABB" });
        expect(readSessionAccessToken(other, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "sid_mismatch",
        });
    });

    it("a different sub than the access token is malformed", () => {
        const other = serviceToken({ sub: "prn_CCCCCCCCCCCCCCCCCCCCCC" });
        expect(readSessionAccessToken(other, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "sub_mismatch",
        });
    });

    it("an exp that differs from the access token's is malformed (must equal)", () => {
        const later = serviceToken({ exp: EXP + 1 });
        const earlier = serviceToken({ exp: EXP - 1 });
        expect(readSessionAccessToken(later, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "exp_mismatch",
        });
        expect(readSessionAccessToken(earlier, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "exp_mismatch",
        });
    });

    it("a non-EdDSA alg is refused", () => {
        const hs = unsigned('{"alg":"HS256","typ":"JWT"}', JSON.stringify({ aud: "auth-service" }));
        expect(readSessionAccessToken(hs, verifiedAccess(), ctx)).toEqual({
            kind: "refused",
            reason: "verify",
        });
    });

    it("a non-string or empty value is malformed", () => {
        for (const value of ["", 7, null, {}, [], true]) {
            expect(readSessionAccessToken(value, verifiedAccess(), ctx)).toEqual({
                kind: "refused",
                reason: "malformed",
            });
        }
    });

    it("refusal answers carry a closed reason and never token text", () => {
        const tok = serviceToken({ sid: "ses_AAAAAAAAAAAAAAAAAAAABB" });
        const got = readSessionAccessToken(tok, verifiedAccess(), ctx);
        expect(JSON.stringify(got)).not.toContain(tok.slice(0, 20));
        expect(Object.keys(got).sort()).toEqual(["kind", "reason"]);
    });
});
