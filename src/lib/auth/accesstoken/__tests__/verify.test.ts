import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    MAX_COMPACT_BYTES,
    MAX_HEADER_BYTES,
    MAX_PAYLOAD_BYTES,
    verifyAccessToken,
    verifyCompactAccessToken,
    type Jwk,
    type VerifyContext,
} from "../verify";

const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) =>
    Buffer.from(typeof b === "string" ? enc.encode(b) : b).toString("base64url");

// Keys are made at run time: no key material in the repository.
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

const header = '{"alg":"EdDSA","typ":"at+jwt","kid":"test-kid-1"}';
const claims =
    '{"iss":"https://auth.example.test","aud":"dev-health-api","sub":"prn_AAAAAAAAAAAAAAAAAAAAAA","principal_type":"human","sid":"ses_AAAAAAAAAAAAAAAAAAAAAQ","jti":"000000000000000000000001","iat":1760000000,"nbf":1760000000,"exp":1760000600,"scope":"api:access"}';

function signed(
    h: string,
    p: string,
): { header: Uint8Array; payload: Uint8Array; signature: Uint8Array } {
    const input = `${b64u(h)}.${b64u(p)}`;
    return {
        header: enc.encode(h),
        payload: enc.encode(p),
        signature: sign(null, Buffer.from(input), privateKey),
    };
}

describe("verifyAccessToken", () => {
    it("accepts a token signed by a published key", () => {
        const got = verifyAccessToken(signed(header, claims), ctx);
        expect(got.ok).toBe(true);
    });

    it("returns only a closed reason, never token text", () => {
        const got = verifyAccessToken(signed(header, claims), {
            ...ctx,
            issuer: "https://other.example.test",
        });
        expect(got).toEqual({ ok: false, reason: "issuer" });
    });
});

describe("input size bound", () => {
    const filler = (n: number) => "x".repeat(n);
    it("refuses a header over the bound before parsing it", () => {
        const over = enc.encode(filler(MAX_HEADER_BYTES + 1));
        const got = verifyAccessToken(
            { header: over, payload: enc.encode(claims), signature: new Uint8Array(64) },
            ctx,
        );
        expect(got).toEqual({ ok: false, reason: "contract", stage: "size" });
    });
    it("does not refuse a header at the bound on size", () => {
        const at = enc.encode(filler(MAX_HEADER_BYTES));
        const got = verifyAccessToken(
            { header: at, payload: enc.encode(claims), signature: new Uint8Array(64) },
            ctx,
        );
        expect(got).toMatchObject({ ok: false, reason: "contract" });
        expect((got as { stage?: string }).stage).not.toBe("size");
    });
    it("refuses a payload over the bound, accepts the bound on size", () => {
        const over = verifyAccessToken(
            {
                header: enc.encode(header),
                payload: enc.encode(filler(MAX_PAYLOAD_BYTES + 1)),
                signature: new Uint8Array(64),
            },
            ctx,
        );
        expect(over).toEqual({ ok: false, reason: "contract", stage: "size" });
        const at = verifyAccessToken(
            {
                header: enc.encode(header),
                payload: enc.encode(filler(MAX_PAYLOAD_BYTES)),
                signature: new Uint8Array(64),
            },
            ctx,
        );
        expect((at as { stage?: string }).stage).not.toBe("size");
    });
    it("refuses a signature over 64 bytes on size", () => {
        const got = verifyAccessToken(
            {
                header: enc.encode(header),
                payload: enc.encode(claims),
                signature: new Uint8Array(65),
            },
            ctx,
        );
        expect(got).toEqual({ ok: false, reason: "contract", stage: "size" });
    });
});

describe("verifyCompactAccessToken", () => {
    const compact = (h: string, p: string) => {
        const s = signed(h, p);
        return `${b64u(s.header)}.${b64u(s.payload)}.${b64u(s.signature)}`;
    };
    it("accepts a well-formed compact token", () => {
        expect(verifyCompactAccessToken(compact(header, claims), ctx).ok).toBe(true);
    });
    it("refuses a compact token over the bound before any decode", () => {
        const got = verifyCompactAccessToken("a".repeat(MAX_COMPACT_BYTES + 1), ctx);
        expect(got).toEqual({ ok: false, reason: "contract", stage: "size" });
    });
    it("refuses wrong framing: part count, padding, bad alphabet, non-canonical tail", () => {
        const good = compact(header, claims);
        const [h, p, s] = good.split(".");
        for (const bad of [
            `${h}.${p}`,
            `${good}.x`,
            `${h}.${p}.`,
            `${h}=.${p}.${s}`,
            `${h}.${p}.${s}+`,
            `${h}.${p} .${s}`,
            `${h}..${s}`,
        ]) {
            expect(verifyCompactAccessToken(bad, ctx), bad).toMatchObject({
                ok: false,
                reason: "contract",
            });
        }
        const tail = h.at(-1)!;
        const flipped = h.slice(0, -1) + (tail === "A" ? "B" : "A");
        if (flipped !== h) {
            expect(verifyCompactAccessToken(`${flipped}.${p}.${s}`, ctx).ok).toBe(false);
        }
    });
    it("refuses invalid UTF-8 in a part", () => {
        const bad = `${b64u(Buffer.from([0xff, 0xfe]))}.${b64u(claims)}.${b64u(new Uint8Array(64))}`;
        expect(verifyCompactAccessToken(bad, ctx)).toMatchObject({ ok: false, reason: "contract" });
    });
});

describe("server-only and dependency guard", () => {
    const dir = path.resolve(__dirname, "..");
    it("verify.ts is server-only", () => {
        const src = readFileSync(path.join(dir, "verify.ts"), "utf8");
        expect(src).toMatch(/^import "server-only";/m);
        expect(src).not.toMatch(/["']use client["']/);
    });
    it("adds no JOSE dependency", () => {
        const pkg = JSON.parse(
            readFileSync(path.resolve(dir, "../../../../package.json"), "utf8"),
        ) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(
            names.filter((n) => /^(jose|jsonwebtoken|jws|jwa|@noble\/ed25519|tweetnacl)$/.test(n)),
        ).toEqual([]);
    });
});
