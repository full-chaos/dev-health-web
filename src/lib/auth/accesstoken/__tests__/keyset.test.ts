import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadKeySet } from "../keyset";

const keyA = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" });
const keyB = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" });

const jwk = (kid: string, key: Record<string, unknown> = keyA, extra = {}) => ({
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    kid,
    x: key.x,
    ...extra,
});
const doc = (...keys: unknown[]) => JSON.stringify({ keys });

describe("loadKeySet", () => {
    it("loads a valid published key set", () => {
        const got = loadKeySet(doc(jwk("kid-a"), jwk("kid-b", keyB)));
        expect(got.ok).toBe(true);
        if (got.ok) expect(got.keys.map((k) => k.kid)).toEqual(["kid-a", "kid-b"]);
    });

    it("refuses the whole key set on a duplicate kid, in both key orders", () => {
        // The repeated kid carries a different key, so a per-key trial would still find a valid key.
        expect(loadKeySet(doc(jwk("kid-a"), jwk("kid-a", keyB), jwk("kid-b", keyB))).ok).toBe(
            false,
        );
        expect(loadKeySet(doc(jwk("kid-b", keyB), jwk("kid-a", keyB), jwk("kid-a"))).ok).toBe(
            false,
        );
    });

    it("refuses a duplicate kid whose copy is byte-identical", () => {
        expect(loadKeySet(doc(jwk("kid-a"), jwk("kid-a"))).ok).toBe(false);
    });

    it("refuses an empty, missing or non-array keys member", () => {
        expect(loadKeySet(doc()).ok).toBe(false);
        expect(loadKeySet("{}").ok).toBe(false);
        expect(loadKeySet('{"keys":{}}').ok).toBe(false);
        expect(loadKeySet("[]").ok).toBe(false);
    });

    it("refuses a key that fails validation, and the whole set with it", () => {
        const bad: Array<[string, unknown]> = [
            ["wrong kty", jwk("kid-b", keyB, { kty: "RSA" })],
            ["wrong crv", jwk("kid-b", keyB, { crv: "Ed448" })],
            ["wrong alg", jwk("kid-b", keyB, { alg: "RS256" })],
            ["alg absent", { ...jwk("kid-b", keyB), alg: undefined }],
            ["use enc", jwk("kid-b", keyB, { use: "enc" })],
            ["blank kid", jwk("  ", keyB)],
            ["long kid", jwk("k".repeat(257), keyB)],
            ["short x", jwk("kid-b", keyB, { x: "AAAA" })],
            ["x not base64url", jwk("kid-b", keyB, { x: "!!!" })],
            ["unknown member", jwk("kid-b", keyB, { d: "AAAA" })],
        ];
        for (const [label, key] of bad) {
            expect(loadKeySet(doc(jwk("kid-a"), key)).ok, label).toBe(false);
        }
    });

    it("refuses an unknown member of the document, a repeated JSON member and trailing text", () => {
        expect(loadKeySet(JSON.stringify({ keys: [jwk("kid-a")], extra: 1 })).ok).toBe(false);
        const dup = '{"keys":[' + JSON.stringify(jwk("kid-a")) + '],"keys":[]}';
        expect(loadKeySet(dup).ok).toBe(false);
        expect(loadKeySet(doc(jwk("kid-a")) + " x").ok).toBe(false);
        expect(loadKeySet("not json").ok).toBe(false);
    });

    it("answers with a closed refusal that carries no document text", () => {
        const got = loadKeySet(doc(jwk("kid-secret-name"), jwk("kid-secret-name")));
        expect(got).toEqual({ ok: false, reason: "invalid_jwks" });
    });
});
