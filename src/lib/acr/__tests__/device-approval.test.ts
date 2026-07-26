import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { approveDeviceAuthorization } from "../service";

const server = setupServer();
const temporaryPaths: string[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;

function writeSigningKey(): string {
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const directory = mkdtempSync(join(tmpdir(), "acr-device-approval-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    return keyFile;
}

function configure(): void {
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", writeSigningKey());
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", "http://ops.example.test");
}

function authenticate(overrides: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: "ops-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123", real_org_id: "org-123", ...overrides },
    });
}

function installOpsAuthorization(
    scopes = ["full-chaos/dev-health-acr", "full-chaos/platform"],
): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", () =>
            HttpResponse.json({
                data: { catalog: { values: scopes.map((value) => ({ count: 1, value })) } },
            }),
        ),
    );
}

function decodeAssertion(value: string): Record<string, unknown> {
    const [header, payload, signature] = value.split(".");
    if (!header || !payload || !signature) throw new Error("malformed assertion");
    expect(
        verify(
            null,
            Buffer.from(`${header}.${payload}`),
            publicKey,
            Buffer.from(signature, "base64url"),
        ),
    ).toBe(true);
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
        string,
        unknown
    >;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    configure();
    authenticate();
});
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

describe("approveDeviceAuthorization", () => {
    it("Given canonical hint intersection, when approving, then sends only the bounded grant with a body-bound credential assertion", async () => {
        installOpsAuthorization();
        server.use(
            http.post(
                "https://acr.example.test/api/v1/oauth/device_approval",
                async ({ request }) => {
                    const body = await request.text();
                    expect(request.headers.get("authorization")).toBeNull();
                    expect(new URL(request.url).search).toBe("");
                    expect(JSON.parse(body)).toEqual({
                        repository_scopes: ["full-chaos/platform"],
                        schema_version: "device_approval_request.v1",
                        user_code: "ABCD2345",
                    });
                    const assertion = request.headers.get("x-acr-web-assertion");
                    expect(assertion).not.toBeNull();
                    if (!assertion) return HttpResponse.json({}, { status: 401 });
                    expect(decodeAssertion(assertion)).toMatchObject({
                        body_sha256: createHash("sha256").update(body).digest("base64url"),
                        method: "POST",
                        path: "/api/v1/oauth/device_approval",
                        permissions: ["credential:issue"],
                        repository_scopes: ["full-chaos/platform"],
                    });
                    return HttpResponse.json({
                        schema_version: "device_approval_response.v1",
                        status: "approved",
                    });
                },
            ),
        );

        await expect(
            approveDeviceAuthorization({
                repositoryScopes: ["full-chaos/platform"],
                repositoryHints: ["full-chaos/platform"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).resolves.toEqual({ status: "approved" });
    });

    it.each([
        ["an empty selection", []],
        ["a foreign selection", ["foreign/repository"]],
        ["a wildcard selection", ["full-chaos/*"]],
    ])(
        "Given %s, when approving, then fails before the ACR call",
        async (_name, repositoryScopes) => {
            installOpsAuthorization();
            let approvals = 0;
            server.use(
                http.post("https://acr.example.test/api/v1/oauth/device_approval", () => {
                    approvals += 1;
                    return HttpResponse.json({
                        schema_version: "device_approval_response.v1",
                        status: "approved",
                    });
                }),
            );

            await expect(
                approveDeviceAuthorization({
                    repositoryScopes,
                    repositoryHints: ["full-chaos/platform"],
                    signal: new AbortController().signal,
                    userCode: "ABCD2345",
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(approvals).toBe(0);
        },
    );

    it("Given impersonation, when approving, then rejects before entitlement resolution", async () => {
        authenticate({
            is_impersonating: true,
            org_id: "org-impersonated",
            real_org_id: "org-123",
        });
        let entitlementRequests = 0;
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () => {
                entitlementRequests += 1;
                return HttpResponse.json({
                    features: { agent_context_runtime: true },
                    is_valid: true,
                });
            }),
        );

        await expect(
            approveDeviceAuthorization({
                repositoryScopes: ["full-chaos/platform"],
                repositoryHints: ["full-chaos/platform"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).rejects.toMatchObject({ status: 403 });
        expect(entitlementRequests).toBe(0);
    });

    it("Given no session, when approving, then rejects before entitlement resolution", async () => {
        vi.mocked(auth).mockResolvedValue(null);
        let entitlementRequests = 0;
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () => {
                entitlementRequests += 1;
                return HttpResponse.json({
                    features: { agent_context_runtime: true },
                    is_valid: true,
                });
            }),
        );

        await expect(
            approveDeviceAuthorization({
                repositoryScopes: ["full-chaos/platform"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).rejects.toMatchObject({ status: 401 });
        expect(entitlementRequests).toBe(0);
    });
});
