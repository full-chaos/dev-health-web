import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcrRuntimeError } from "../errors";
import { loadAcrRuntimeConfig } from "../config";
import { signWebAssertion } from "../assertion";
import { fetchBoundedJson } from "../http";

const temporaryPaths: string[] = [];

function writeSigningKey(mode = 0o600): string {
    const directory = mkdtempSync(join(tmpdir(), "acr-web-key-"));
    temporaryPaths.push(directory);
    const privateKey = generateKeyPairSync("ed25519").privateKey.export({
        format: "pem",
        type: "pkcs8",
    });
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, privateKey);
    chmodSync(keyFile, mode);
    return keyFile;
}

function configure(keyFile: string, origin = "https://acr.example.test"): void {
    vi.stubEnv("ACR_API_ORIGIN", origin);
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

describe("ACR server runtime configuration", () => {
    it("rejects a non-HTTPS ACR origin before any request can be signed", () => {
        const keyFile = writeSigningKey();
        configure(keyFile, "http://acr.example.test");

        expect(() => loadAcrRuntimeConfig()).toThrow(AcrRuntimeError);
    });

    it("rejects a group-readable private key", () => {
        const keyFile = writeSigningKey(0o640);
        configure(keyFile);

        expect(() => loadAcrRuntimeConfig()).toThrow(AcrRuntimeError);
    });

    it("signs a read-only assertion bound to its exact request body", () => {
        const keyFile = writeSigningKey();
        configure(keyFile);
        const config = loadAcrRuntimeConfig();
        const body = '{"schema_version":"context_packet_request.v1"}';

        const assertion = signWebAssertion({
            body,
            config,
            method: "POST",
            path: "/api/v1/agent-context/context-packets",
            permissions: ["context:read"],
            privateKey: config.privateKey,
            repositoryScopes: ["full-chaos/dev-health-acr"],
            subject: "user-123",
            orgId: "org-123",
            now: 1_700_000_000,
        });

        expect(assertion.split(".")).toHaveLength(3);
        expect(assertion).not.toContain("BEGIN PRIVATE KEY");
    });

    it("uses no-store caching and refuses redirects for every server request", async () => {
        const fetchSpy = vi.fn(
            (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
                Promise.resolve(Response.json({ status: "ok" })),
        );
        vi.stubGlobal("fetch", fetchSpy);

        await fetchBoundedJson({
            headers: {},
            method: "GET",
            timeoutMs: 100,
            url: new URL("https://acr.example.test/api/v1/agent-context/capabilities"),
        });

        const options = fetchSpy.mock.calls[0]?.[1];
        expect(options?.cache).toBe("no-store");
        expect(options?.redirect).toBe("error");
        expect(options?.headers).toMatchObject({ "Cache-Control": "no-store" });
    });
});
