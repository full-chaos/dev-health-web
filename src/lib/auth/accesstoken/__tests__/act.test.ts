import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAccessToken, type Jwk, type VerifyContext } from "../verify";

const enc = new TextEncoder();
const b64u = (s: string) => Buffer.from(enc.encode(s)).toString("base64url");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "act-kid-1" } as unknown as Jwk;
const ctx: VerifyContext = {
    issuer: "https://auth.example.test",
    audience: "dev-health-api",
    nowSeconds: 1760000300,
    publishedKeys: [jwk],
    removedKids: [],
};
const header = '{"alg":"EdDSA","typ":"at+jwt","kid":"act-kid-1"}';
const ACTOR = "prn_BBBBBBBBBBBBBBBBBBBBBB";

function payload(act: string | null): string {
    const base =
        '"iss":"https://auth.example.test","aud":"dev-health-api","sub":"prn_AAAAAAAAAAAAAAAAAAAAAA","principal_type":"human","sid":"ses_AAAAAAAAAAAAAAAAAAAAAQ","jti":"000000000000000000000001","iat":1760000000,"nbf":1760000000,"exp":1760000600,"scope":"api:access"';
    return `{${base}${act === null ? "" : `,"act":${act}`}}`;
}

function verify(act: string | null) {
    const p = payload(act);
    return verifyAccessToken(
        {
            header: enc.encode(header),
            payload: enc.encode(p),
            signature: sign(null, Buffer.from(`${b64u(header)}.${b64u(p)}`), privateKey),
        },
        ctx,
    );
}

describe("act claim", () => {
    it("accepts a token without act and reports no actor", () => {
        const got = verify(null);
        expect(got).toMatchObject({ ok: true, actor: null });
    });

    it("accepts one act hop and keeps sub as the effective subject", () => {
        const got = verify(`{"sub":"${ACTOR}"}`);
        expect(got).toMatchObject({ ok: true, actor: ACTOR });
        if (got.ok) expect(got.claims.sub).toBe("prn_AAAAAAAAAAAAAAAAAAAAAA");
    });

    it.each([
        ["nested act", `{"sub":"${ACTOR}","act":{"sub":"${ACTOR}"}}`],
        ["extra member in act", `{"sub":"${ACTOR}","scope":"api:access"}`],
        ["empty act", "{}"],
        ["bad sub pattern", '{"sub":"user_1"}'],
        ["sub not a string", '{"sub":1}'],
        ["act not an object", '"prn_BBBBBBBBBBBBBBBBBBBBBB"'],
        ["act an array", `[{"sub":"${ACTOR}"}]`],
        ["act null", "null"],
        ["duplicate sub in act", `{"sub":"${ACTOR}","sub":"${ACTOR}"}`],
    ])("refuses %s on the contract schema stage", (_name, act) => {
        expect(verify(act)).toMatchObject({ ok: false, reason: "contract" });
    });
});
