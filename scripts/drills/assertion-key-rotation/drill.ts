// Drill helper for the web assertion key rotation (CHAOS-11236). Run with:
//   npx tsx --conditions react-server scripts/drills/assertion-key-rotation/drill.ts <verb> ...
// The `call` verb signs with the REAL web signer (src/lib/acr/assertion.ts) and the REAL config loader
// (src/lib/acr/config.ts), so the kid and the key come from ACR_WEB_ASSERTION_KID and
// ACR_WEB_ASSERTION_KEY_FILE exactly as the web runtime reads them. It prints names and numbers only:
// never a key, a token or a JWKS member.
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { signWebAssertion } from "../../../src/lib/acr/assertion";
import { loadAcrRuntimeConfig } from "../../../src/lib/acr/config";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY = "full-chaos/acr-integration";
const PATH = "/api/v1/agent-context/context-packets";

function usage(): never {
    process.stderr.write(
        "verbs: keygen <dir> <kid> | jwks <out> <kid>=<x-file>[@<retire_after RFC 3339>] ... | call\n",
    );
    process.exit(2);
}

function keygen(dir: string, kid: string): void {
    const { privateKey } = generateKeyPairSync("ed25519");
    const keyFile = join(dir, `${kid}.pem`);
    writeFileSync(keyFile, String(privateKey.export({ format: "pem", type: "pkcs8" })), {
        mode: 0o600,
    });
    chmodSync(keyFile, 0o600);
    const x = createPublicKey(privateKey).export({ format: "jwk" }).x;
    if (typeof x !== "string") throw new Error("no public x");
    writeFileSync(join(dir, `${kid}.x`), x, { mode: 0o600 });
    process.stdout.write(
        `keygen kid=${kid} private-key-file-written public-x-length=${x.length}\n`,
    );
}

function jwks(out: string, specs: readonly string[]): void {
    const keys = specs.map((spec) => {
        const [head, retireAfter] = spec.split("@");
        const [kid, xFile] = (head ?? "").split("=");
        if (!kid || !xFile) usage();
        const x = readFileSync(xFile, "utf8").trim();
        return {
            alg: "EdDSA",
            crv: "Ed25519",
            kid,
            kty: "OKP",
            ...(retireAfter ? { retire_after: retireAfter } : {}),
            x,
        };
    });
    writeFileSync(out, JSON.stringify({ keys }), { mode: 0o644 });
    process.stdout.write(
        `jwks kids=${keys.map((k) => k.kid).join(",")} retire_after=${keys
            .map((k) => ("retire_after" in k ? k.retire_after : "-"))
            .join(",")}\n`,
    );
}

async function call(): Promise<void> {
    const config = loadAcrRuntimeConfig();
    const body = JSON.stringify({
        client: { name: "web", sidecar_version: "0.1.0", version: "1.0.0" },
        goal: "Investigate seeded CI failure",
        options: { max_items: 10, max_output_tokens: 500, max_serialized_bytes: 8192 },
        repository: { slug: REPOSITORY },
        request_id: "web-assertion-rotation-drill",
        schema_version: "context_packet_request.v1",
        scope: { branch: "main" },
    });
    const token = signWebAssertion({
        body,
        config,
        method: "POST",
        orgId: ORG_ID,
        path: PATH,
        permissions: ["context:read", "evidence:read"],
        privateKey: config.privateKey,
        repositoryScopes: [REPOSITORY],
        subject: "user_drill",
    });
    const response = await fetch(new URL(PATH, config.apiOrigin), {
        body,
        headers: {
            "Content-Type": "application/json",
            "X-ACR-Client-Version": "1.0.0",
            "X-ACR-Web-Assertion": token,
        },
        method: "POST",
        signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let code = "-";
    try {
        const parsed = JSON.parse(text) as { error?: { code?: string } };
        code = parsed.error?.code ?? "-";
    } catch {
        code = "-";
    }
    process.stdout.write(`call kid=${config.keyId} status=${response.status} error_code=${code}\n`);
}

async function main(): Promise<void> {
    const [verb, ...rest] = process.argv.slice(2);
    if (verb === "keygen" && rest.length === 2) keygen(rest[0]!, rest[1]!);
    else if (verb === "jwks" && rest.length >= 2) jwks(rest[0]!, rest.slice(1));
    else if (verb === "call") await call();
    else usage();
}

main().catch((error: unknown) => {
    process.stderr.write(`drill failed: ${error instanceof Error ? error.name : "error"}\n`);
    process.exit(1);
});
