import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signWebAssertion } from "../assertion";

const { privateKey } = generateKeyPairSync("ed25519");
const config = {
    apiOrigin: new URL("https://acr.example.test"),
    audience: "dev-health-acr",
    issuer: "dev-health-web",
    keyId: "web-key-2026",
    privateKey,
    timeoutMs: 5_000,
};

function claims(body: string, now = 1_800_000_000): Record<string, unknown> {
    const token = signWebAssertion({
        body,
        config,
        method: "POST",
        now,
        orgId: "org-123",
        path: "/api/v1/agent-context/context-packets",
        permissions: ["context:read"],
        privateKey,
        repositoryScopes: ["*"],
        subject: "user-123",
    });
    return JSON.parse(
        Buffer.from(token.split(".")[1] as string, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
}

describe("web assertion binding", () => {
    it("lives 30 s, keeps a unique jti and binds method, path and body", () => {
        const body = JSON.stringify({ a: 1 });
        const first = claims(body);
        const second = claims(body);
        expect((first["exp"] as number) - (first["iat"] as number)).toBe(30);
        expect(first["jti"]).not.toBe(second["jti"]);
        expect(first["method"]).toBe("POST");
        expect(first["path"]).toBe("/api/v1/agent-context/context-packets");
        expect(first["body_sha256"]).toBe(
            createHash("sha256").update(body, "utf8").digest("base64url"),
        );
        expect(first["repository_scopes"]).toEqual(["*"]);
    });
});
