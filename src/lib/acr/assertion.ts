import "server-only";

import { createHash, randomUUID, sign, type KeyObject } from "node:crypto";

import type { AcrRuntimeConfig } from "./config";

type AssertionPermission = "context:read" | "credential:issue" | "evidence:read";

type WebAssertionInput = {
    readonly body: string;
    readonly config: AcrRuntimeConfig;
    readonly method: "GET" | "POST";
    readonly now?: number;
    readonly orgId: string;
    readonly path: string;
    readonly permissions: readonly AssertionPermission[];
    readonly privateKey: KeyObject;
    readonly repositoryScopes: readonly string[];
    readonly subject: string;
};

function encodeCompactJson(value: object): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function bodySha256(body: string): string {
    return createHash("sha256").update(body, "utf8").digest("base64url");
}

export function signWebAssertion(input: WebAssertionInput): string {
    const issuedAt = input.now ?? Math.floor(Date.now() / 1_000);
    const header = encodeCompactJson({ alg: "EdDSA", kid: input.config.keyId, typ: "JWT" });
    const claims = encodeCompactJson({
        aud: input.config.audience,
        body_sha256: bodySha256(input.body),
        exp: issuedAt + 30,
        iat: issuedAt,
        iss: input.config.issuer,
        jti: randomUUID(),
        method: input.method,
        nbf: issuedAt,
        org_id: input.orgId,
        path: input.path,
        permissions: [...input.permissions],
        repository_scopes: [...input.repositoryScopes],
        sub: input.subject,
    });
    const signingInput = `${header}.${claims}`;
    const signature = sign(null, Buffer.from(signingInput, "utf8"), input.privateKey).toString(
        "base64url",
    );
    return `${signingInput}.${signature}`;
}
