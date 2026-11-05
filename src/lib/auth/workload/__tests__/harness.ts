import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

export const BASE = "https://auth-internal.example.test:8097";
export const ISSUER = "https://auth.example.test";
export const SUBJECT_CANARY = "subj-canary-AAAA1111.subj-canary-BBBB2222.subj-canary-CCCC3333";
export const TOKEN_CANARY = "tok-canary-ZZZZ9999";

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

export function jwt(over: Record<string, unknown> = {}, tag = TOKEN_CANARY): string {
    const claims = {
        iss: ISSUER,
        aud: "auth-service",
        sub: "prn_web",
        principal_type: "workload",
        jti: tag,
        ...over,
    };
    return `${b64({ alg: "EdDSA", typ: "workload+jwt", kid: "k1" })}.${b64(claims)}.${tag}sig`;
}

export function jwtRaw(payloadText: string): string {
    return `${b64({ alg: "EdDSA", typ: "workload+jwt", kid: "k1" })}.${Buffer.from(payloadText).toString("base64url")}.sig`;
}

export function answer(token: string, expiresIn: unknown = 300): Record<string, unknown> {
    return {
        access_token: token,
        token_type: "Bearer",
        issued_token_type: "urn:ietf:params:oauth:token-type:jwt",
        expires_in: expiresIn,
    };
}

export function jsonResponse(body: unknown, status = 200, type = "application/json"): Response {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": type },
    });
}

export function subjectFile(value = SUBJECT_CANARY): string {
    const dir = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "wt-"));
    const file = path.join(dir, "token");
    writeFileSync(file, value + "\n");
    return file;
}

export function setEnv(file: string) {
    vi.stubEnv("AUTH_INTERNAL_URL", BASE);
    vi.stubEnv("AUTH_WORKLOAD_SUBJECT_FILE", file);
    vi.stubEnv("AUTH_WORKLOAD_ISSUER", ISSUER);
}

export async function load() {
    vi.resetModules();
    return import("../token");
}
