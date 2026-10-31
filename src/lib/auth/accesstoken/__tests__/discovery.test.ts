import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDiscovery } from "../discovery";

const ISSUER = "https://auth.example.test";
const doc = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ["EdDSA"],
        ...over,
    });

describe("parseDiscovery", () => {
    it("accepts a document whose issuer is the pinned issuer and whose jwks_uri is issuer plus the fixed path", () => {
        expect(parseDiscovery(doc(), ISSUER)).toEqual({
            ok: true,
            jwksUri: `${ISSUER}/.well-known/jwks.json`,
        });
    });

    it("accepts an issuer with a port and a path prefix", () => {
        const issuer = "https://auth.example.test:8443/tenant-a";
        const text = doc({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json` });
        expect(parseDiscovery(text, issuer)).toEqual({
            ok: true,
            jwksUri: `${issuer}/.well-known/jwks.json`,
        });
    });

    it("refuses an issuer that is not the pinned issuer, however well formed the document is", () => {
        const other = "https://other.example.test";
        const text = doc({ issuer: other, jwks_uri: `${other}/.well-known/jwks.json` });
        expect(parseDiscovery(text, ISSUER)).toEqual({ ok: false });
    });

    it("refuses a jwks_uri that is not exactly issuer plus /.well-known/jwks.json", () => {
        const bad = [
            "https://other.example.test/.well-known/jwks.json",
            "https://auth.example.test:8443/.well-known/jwks.json",
            "https://auth.example.test/tenant/.well-known/jwks.json",
            "https://auth.example.test/.well-known/jwks.json?x=1",
            "https://auth.example.test/jwks.json",
            "https://auth.example.test/.well-known/jwks.json/",
        ];
        for (const jwks_uri of bad) {
            expect(parseDiscovery(doc({ jwks_uri }), ISSUER), jwks_uri).toEqual({ ok: false });
        }
    });

    it("refuses a document that is not exactly the three members, or whose algs are not exactly [EdDSA]", () => {
        const bad = [
            doc({ token_endpoint: "https://auth.example.test/token" }),
            doc({ id_token_signing_alg_values_supported: ["EdDSA", "none"] }),
            doc({ id_token_signing_alg_values_supported: ["HS256"] }),
            doc({ id_token_signing_alg_values_supported: [] }),
            doc({ id_token_signing_alg_values_supported: undefined }),
            doc({ jwks_uri: undefined }),
            doc({ issuer: undefined }),
            "[]",
            "not json",
            doc() + " x",
            `{"issuer":"${ISSUER}","issuer":"${ISSUER}","jwks_uri":"${ISSUER}/.well-known/jwks.json","id_token_signing_alg_values_supported":["EdDSA"]}`,
        ];
        for (const text of bad) {
            expect(parseDiscovery(text, ISSUER), text.slice(0, 40)).toEqual({ ok: false });
        }
    });

    it("refuses an issuer that is http, has a trailing slash, a query or userinfo", () => {
        for (const issuer of [
            "http://auth.example.test",
            "https://auth.example.test/",
            "https://auth.example.test?a=b",
            "https://user@auth.example.test",
        ]) {
            const text = doc({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json` });
            expect(parseDiscovery(text, issuer), issuer).toEqual({ ok: false });
        }
    });

    it("answers with a closed refusal and no document text", () => {
        expect(parseDiscovery(doc({ issuer: "https://secret-host.example.test" }), ISSUER)).toEqual(
            {
                ok: false,
            },
        );
    });
});

// The discovery corpus is owned by dev-health-ops and arrives through the pinned sparse checkout
// (ci/ops-contract.pin). WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 turns a missing checkout into a failure.
const contractRoot = process.env.WEB_OPS_CONTRACT_ROOT ?? "";
const required = process.env.WEB_REQUIRE_ACCESS_TOKEN_CORPUS === "1";
const suite = contractRoot !== "" || required ? describe : describe.skip;
const dir = path.join(contractRoot, "contracts/auth/v1/examples/discovery");
const read = (file: string) => readFileSync(path.join(dir, file), "utf8");

interface Manifest {
    accept: { file: string }[];
    reject: { file: string }[];
    reject_by_client: { file: string }[];
}

suite("parseDiscovery against the pinned discovery corpus", () => {
    const manifest = JSON.parse(read("manifest.json")) as Manifest;

    it("accepts every accept fixture when its own issuer is the pinned issuer", () => {
        for (const { file } of manifest.accept) {
            const text = read(file);
            const issuer = (JSON.parse(text) as { issuer: string }).issuer;
            expect(parseDiscovery(text, issuer), file).toMatchObject({ ok: true });
        }
    });

    it("refuses every reject fixture", () => {
        for (const { file } of manifest.reject) {
            const text = read(file);
            const issuer = (JSON.parse(text) as { issuer?: unknown }).issuer;
            expect(
                parseDiscovery(text, typeof issuer === "string" ? issuer : ISSUER),
                file,
            ).toEqual({
                ok: false,
            });
        }
    });

    it("refuses every reject_by_client fixture", () => {
        for (const { file } of manifest.reject_by_client) {
            const text = read(file);
            const own = (JSON.parse(text) as { issuer: string }).issuer;
            // The not-pinned fixture is self-consistent: it is refused only by the pin.
            const pinned = file === "client-rejected-issuer-not-pinned.json" ? ISSUER : own;
            expect(parseDiscovery(text, pinned), file).toEqual({ ok: false });
        }
    });

    it("covers every fixture file of the corpus, so a new one cannot go unread", () => {
        const listed = [...manifest.accept, ...manifest.reject, ...manifest.reject_by_client]
            .map((row) => row.file)
            .sort();
        const onDisk = readdirSync(dir)
            .filter((f) => f !== "manifest.json")
            .sort();
        expect(listed).toEqual(onDisk);
    });
});
