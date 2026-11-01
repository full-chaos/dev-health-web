import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIENCE_SCOPES } from "../claims";
import { verifyAccessToken, type Jwk } from "../verify";

// web learns the acr-api and acr-mcp audience names (access-token.v1 allOf) only so that a token
// for them fails as `audience`, not as `contract`. The accepted audiences stay in the callers of
// the verifier: dev-health-api and auth-service.
const ALLOWED_CALLER_AUDIENCES = ["dev-health-api", "auth-service"];

describe("audience names", () => {
    it("binds each audience to its coarse scope, as the pinned schema does", () => {
        expect(AUDIENCE_SCOPES).toEqual({
            "dev-health-api": "api:access",
            "auth-service": "auth:session",
            "acr-api": "acr:api",
            "acr-mcp": "acr:mcp",
        });
    });
});

const srcRoot = path.resolve(__dirname, "../../..");
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "__tests__" || e.name === "node_modules") continue;
            out.push(...sourceFiles(abs));
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
            out.push(abs);
        }
    }
    return out;
}

describe("census of production verify calls", () => {
    const callers = sourceFiles(srcRoot)
        .filter((f) => !f.includes(`${path.sep}accesstoken${path.sep}`))
        .map((f) => ({ f, text: readFileSync(f, "utf8") }))
        .filter(({ text }) => /\bverify(Compact)?AccessToken\b/.test(text));

    it("finds the production callers", () => {
        expect(callers.length).toBeGreaterThanOrEqual(1);
    });
    it("passes only a literal from the allowed pair as the audience", () => {
        const seen: string[] = [];
        for (const { f, text } of callers) {
            const ctxAudiences = [...text.matchAll(/\baudience\s*:\s*([^,}\n]+)/g)].map((m) =>
                m[1].trim(),
            );
            expect(ctxAudiences.length, f).toBeGreaterThan(0);
            for (const a of ctxAudiences) {
                const lit = /^"([^"]*)"$/.exec(a);
                expect(lit, `${path.relative(srcRoot, f)}: audience ${a}`).not.toBeNull();
                expect(ALLOWED_CALLER_AUDIENCES, f).toContain(lit?.[1]);
                seen.push(lit?.[1] ?? "");
            }
        }
        expect(seen).toContain("dev-health-api");
        expect(seen).toContain("auth-service");
    });
});

const contractRoot = process.env.WEB_OPS_CONTRACT_ROOT ?? "";
const required = process.env.WEB_REQUIRE_ACCESS_TOKEN_CORPUS === "1";
const suite = contractRoot !== "" || required ? describe : describe.skip;

interface Row {
    file: string;
    now: number;
}
interface Manifest {
    issuer: string;
    vectors: Row[];
}
const goldenDir = path.join(contractRoot, "contracts/auth/v1/golden/access-token");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

suite("acr tokens at web's own audiences", () => {
    if (contractRoot === "") return;
    const manifest = readJson<Manifest>(path.join(goldenDir, "manifest.json"));
    const jwks = readJson<{ keys: Jwk[] }>(path.join(goldenDir, "jwks.json"));
    const cases = ["valid-acr-api.json", "valid-acr-mcp.json"].flatMap((file) =>
        ALLOWED_CALLER_AUDIENCES.map((audience) => ({ file, audience })),
    );
    it.each(cases)("refuses $file verified as $audience", ({ file, audience }) => {
        const row = manifest.vectors.find((r) => r.file === file);
        expect(row).toBeDefined();
        const v = readJson<{ header_json: string; payload_json: string; signature_hex: string }>(
            path.join(goldenDir, "vectors", file),
        );
        const got = verifyAccessToken(
            {
                header: new TextEncoder().encode(v.header_json),
                payload: new TextEncoder().encode(v.payload_json),
                signature: Uint8Array.from(Buffer.from(v.signature_hex, "hex")),
            },
            {
                issuer: manifest.issuer,
                audience,
                nowSeconds: row?.now ?? 0,
                publishedKeys: jwks.keys,
                removedKids: [],
            },
        );
        expect(got).toMatchObject({ ok: false, reason: "audience" });
    });
});
