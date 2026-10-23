import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { parseStrictJson, StrictJsonError } from "../strictjson";
import {
    ACCESS_TOKEN_LIFETIME_CEILING_SECONDS,
    LEEWAY_SECONDS,
    verifyAccessToken,
    type Jwk,
    type VerifyContext,
} from "../verify";

// The corpus is owned by dev-health-ops and arrives through the pinned sparse
// checkout (ci/ops-contract.pin). WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 (the CI gate
// tier) turns a missing checkout into a failure; a bare local run skips loudly.
const contractRoot = process.env.WEB_OPS_CONTRACT_ROOT ?? "";
const required = process.env.WEB_REQUIRE_ACCESS_TOKEN_CORPUS === "1";
const present = contractRoot !== "";
const suite = present || required ? describe : describe.skip;

const v1 = path.join(contractRoot, "contracts/auth/v1");
const goldenDir = path.join(v1, "golden/access-token");

interface Row {
    file: string;
    now: number;
    verify_as_audience: string;
    expect: "accept" | "reject";
    reason?: string;
    contract_stage?: string;
    key_set?: string;
}
interface Manifest {
    issuer: string;
    leeway_seconds: number;
    removed_kids: string[];
    removed_public_keys: Jwk[];
    decision_order: string[];
    vectors: Row[];
}
interface Vector {
    header_json: string;
    payload_json: string;
    signature_hex: string;
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function ctxFor(m: Manifest, jwks: { keys: Jwk[] }, row: Row): VerifyContext {
    return {
        issuer: m.issuer,
        audience: row.verify_as_audience,
        nowSeconds: row.now,
        publishedKeys:
            row.key_set === "published_and_removed"
                ? [...jwks.keys, ...m.removed_public_keys]
                : jwks.keys,
        removedKids: m.removed_kids,
    };
}

function decide(m: Manifest, jwks: { keys: Jwk[] }, row: Row) {
    const v = readJson<Vector>(path.join(goldenDir, "vectors", row.file));
    return verifyAccessToken(
        {
            header: new TextEncoder().encode(v.header_json),
            payload: new TextEncoder().encode(v.payload_json),
            signature: Uint8Array.from(Buffer.from(v.signature_hex, "hex")),
        },
        ctxFor(m, jwks, row),
    );
}

suite("access-token corpus", () => {
    it("is present when the gate requires it", () => {
        expect(present).toBe(true);
    });

    if (!present) return;
    const manifest = readJson<Manifest>(path.join(goldenDir, "manifest.json"));
    const jwks = readJson<{ keys: Jwk[] }>(path.join(goldenDir, "jwks.json"));

    it("decides every vector as the manifest says", () => {
        expect(manifest.vectors.length).toBeGreaterThan(0);
        for (const row of manifest.vectors) {
            const got = decide(manifest, jwks, row);
            if (row.expect === "accept") {
                expect(got.ok, row.file).toBe(true);
            } else {
                expect(got.ok, row.file).toBe(false);
                if (got.ok) continue;
                expect(got.reason, row.file).toBe(row.reason);
                expect(got.stage, row.file).toBe(row.contract_stage);
            }
        }
    });

    it("covers every vector file and names no missing one", () => {
        const onDisk = readdirSync(path.join(goldenDir, "vectors")).sort();
        expect(manifest.vectors.map((r) => r.file).sort()).toEqual(onDisk);
    });

    it("refuses the removed kid even when a stale key set still holds it", () => {
        const rows = manifest.vectors.filter((r) => r.key_set === "published_and_removed");
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const got = decide(manifest, jwks, row);
            expect(got).toMatchObject({ ok: false, reason: "unknown_kid" });
        }
    });

    it("decides in the manifest's decision order", () => {
        expect(manifest.decision_order).toEqual([
            "contract",
            "unknown_kid",
            "signature",
            "issuer",
            "audience",
            "not_yet_valid",
            "expired",
        ]);
    });

    it("takes leeway and the lifetime ceiling from the pinned contract", () => {
        expect(LEEWAY_SECONDS).toBe(manifest.leeway_seconds);
        const schema = readFileSync(
            path.join(v1, "jsonschema/access-token.v1.schema.json"),
            "utf8",
        );
        expect(schema).toContain("AccessTokenLifetimeCeiling");
        const atCeiling = readJson<Vector>(
            path.join(goldenDir, "vectors/valid-lifetime-at-the-ceiling.json"),
        );
        const over = readJson<Vector>(
            path.join(goldenDir, "vectors/invalid-lifetime-over-the-ceiling.json"),
        );
        const life = (v: Vector) => {
            const c = parseStrictJson(v.payload_json) as { iat: number; exp: number };
            return c.exp - c.iat;
        };
        expect(life(atCeiling)).toBe(ACCESS_TOKEN_LIFETIME_CEILING_SECONDS);
        expect(life(over)).toBe(ACCESS_TOKEN_LIFETIME_CEILING_SECONDS + 1);
    });

    it("agrees with the pinned JSON schema on every vector that reaches the schema", () => {
        const ajv = new Ajv2020({ strict: false, allErrors: false });
        const dir = path.join(v1, "jsonschema");
        for (const f of readdirSync(dir)) {
            if (f.endsWith(".schema.json")) ajv.addSchema(readJson<object>(path.join(dir, f)));
        }
        const validate = ajv.getSchema(
            "https://fullchaos.dev/contracts/auth/v1/jsonschema/access-token.v1.schema.json",
        );
        expect(validate).toBeTruthy();
        let checked = 0;
        for (const row of manifest.vectors) {
            const v = readJson<Vector>(path.join(goldenDir, "vectors", row.file));
            let doc: { header: unknown; claims: unknown };
            try {
                doc = {
                    header: parseStrictJson(v.header_json),
                    claims: parseStrictJson(v.payload_json),
                };
            } catch (e) {
                if (e instanceof StrictJsonError) continue;
                throw e;
            }
            const schemaOk = validate!(doc) === true;
            const got = decide(manifest, jwks, row);
            const refusedBySchema = !got.ok && got.reason === "contract" && got.stage === "schema";
            expect(schemaOk, row.file).toBe(!refusedBySchema);
            checked++;
        }
        expect(checked).toBeGreaterThan(30);
    });
});
