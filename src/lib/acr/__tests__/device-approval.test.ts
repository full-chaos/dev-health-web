import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { approveDeviceAuthorization, previewDeviceAuthorization } from "../service";

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

function installOpsAuthorization(scopes = ["full-chaos/dev-health-acr", "full-chaos/platform"]): {
    repositoryCatalogRequests: number;
} {
    const observations = { repositoryCatalogRequests: 0 };
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post("http://ops.example.test/graphql", () => {
            observations.repositoryCatalogRequests += 1;
            return HttpResponse.json({
                data: { catalog: { values: scopes.map((value) => ({ count: 1, value })) } },
            });
        }),
    );
    return observations;
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
    it("Given ACR-generated L and U characters, when previewing, then forwards the valid code", async () => {
        installOpsAuthorization();
        server.use(
            http.post(
                "https://acr.example.test/api/v1/oauth/device_approval",
                async ({ request }) => {
                    expect(await request.json()).toEqual({
                        schema_version: "device_approval_preview_request.v1",
                        user_code: "ALU23456",
                    });
                    return HttpResponse.json({
                        schema_version: "device_approval_preview_response.v1",
                    });
                },
            ),
        );

        await expect(
            previewDeviceAuthorization({
                signal: new AbortController().signal,
                userCode: "ALU23456",
            }),
        ).resolves.toEqual({ repositoryHints: [] });
    });

    it("Given an explicit selected repository, when approving, then sends only the bounded grant with a body-bound credential assertion", async () => {
        const ops = installOpsAuthorization();
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
                        org_id: "org-123",
                        path: "/api/v1/oauth/device_approval",
                        permissions: ["credential:issue"],
                        repository_scopes: ["full-chaos/platform"],
                        sub: "user-123",
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
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).resolves.toEqual({ status: "approved" });
        expect(ops.repositoryCatalogRequests).toBe(0);
    });

    it("Given organization-wide approval, when previewing and approving, then never derives authorization from the repository catalog", async () => {
        const ops = installOpsAuthorization();
        const assertions: string[] = [];
        server.use(
            http.post(
                "https://acr.example.test/api/v1/oauth/device_approval",
                async ({ request }) => {
                    const body = await request.text();
                    expect(request.headers.get("authorization")).toBeNull();
                    expect(new URL(request.url).search).toBe("");
                    const assertion = request.headers.get("x-acr-web-assertion");
                    expect(assertion).not.toBeNull();
                    if (!assertion) return HttpResponse.json({}, { status: 401 });
                    assertions.push(assertion);
                    const requestBody = JSON.parse(body) as { readonly schema_version: string };
                    if (requestBody.schema_version === "device_approval_preview_request.v1") {
                        expect(requestBody).toEqual({
                            schema_version: "device_approval_preview_request.v1",
                            user_code: "ABCD2345",
                        });
                        expect(decodeAssertion(assertion)).toMatchObject({
                            body_sha256: createHash("sha256").update(body).digest("base64url"),
                            method: "POST",
                            org_id: "org-123",
                            path: "/api/v1/oauth/device_approval",
                            permissions: ["credential:issue"],
                            repository_scopes: ["*"],
                            sub: "user-123",
                        });
                        return HttpResponse.json({
                            organization_id_hint: "org_fullchaos",
                            schema_version: "device_approval_preview_response.v1",
                            repository_hints: ["full-chaos/platform"],
                        });
                    }
                    expect(requestBody).toEqual({
                        repository_scopes: ["*"],
                        schema_version: "device_approval_request.v1",
                        user_code: "ABCD2345",
                    });
                    expect(decodeAssertion(assertion)).toMatchObject({
                        body_sha256: createHash("sha256").update(body).digest("base64url"),
                        method: "POST",
                        org_id: "org-123",
                        path: "/api/v1/oauth/device_approval",
                        permissions: ["credential:issue"],
                        repository_scopes: ["*"],
                        sub: "user-123",
                    });
                    return HttpResponse.json({
                        schema_version: "device_approval_response.v1",
                        status: "approved",
                    });
                },
            ),
        );

        await expect(
            previewDeviceAuthorization({
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).resolves.toEqual({
            organizationIdHint: "org_fullchaos",
            repositoryHints: ["full-chaos/platform"],
        });
        await expect(
            approveDeviceAuthorization({
                repositoryScopes: ["*"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).resolves.toEqual({ status: "approved" });
        expect(assertions).toHaveLength(2);
        expect(assertions[0]).not.toBe(assertions[1]);
        expect(ops.repositoryCatalogRequests).toBe(0);
    });

    it("Given ACR reports a device authorization conflict, when approving, then preserves the 409 response", async () => {
        installOpsAuthorization();
        server.use(
            http.post("https://acr.example.test/api/v1/oauth/device_approval", () =>
                HttpResponse.json(
                    {
                        error: {
                            code: "device_authorization_conflict",
                            http_status: 409,
                            message: "Device authorization is no longer pending",
                            retryable: false,
                        },
                        request_id: "req_device_conflict",
                        schema_version: "error.v1",
                    },
                    { status: 409 },
                ),
            ),
        );

        await expect(
            approveDeviceAuthorization({
                repositoryScopes: ["*"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).rejects.toMatchObject({ code: "upstream", retryable: false, status: 409 });
    });

    it("Given a preview with no repository hints, when ACR omits the optional field, then returns an empty selection", async () => {
        installOpsAuthorization();
        server.use(
            http.post("https://acr.example.test/api/v1/oauth/device_approval", () =>
                HttpResponse.json({
                    schema_version: "device_approval_preview_response.v1",
                }),
            ),
        );

        await expect(
            previewDeviceAuthorization({
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).resolves.toEqual({ repositoryHints: [] });
    });

    it.each([
        ["a null hint", null],
        ["an empty hint", ""],
        ["an oversized hint", "o".repeat(129)],
        ["a non-string hint", 42],
    ])(
        "Given %s, when previewing, then rejects the malformed response",
        async (_name, organizationIdHint) => {
            installOpsAuthorization();
            server.use(
                http.post("https://acr.example.test/api/v1/oauth/device_approval", () =>
                    HttpResponse.json({
                        organization_id_hint: organizationIdHint,
                        repository_hints: ["full-chaos/platform"],
                        schema_version: "device_approval_preview_response.v1",
                    }),
                ),
            );

            await expect(
                previewDeviceAuthorization({
                    signal: new AbortController().signal,
                    userCode: "ABCD2345",
                }),
            ).rejects.toMatchObject({ code: "malformed_response" });
        },
    );

    it.each([
        [
            "a different schema version",
            {
                repository_hints: ["full-chaos/platform"],
                schema_version: "device_approval_preview_response.v2",
            },
        ],
        [
            "a non-array repository hint value",
            {
                repository_hints: "full-chaos/platform",
                schema_version: "device_approval_preview_response.v1",
            },
        ],
        [
            "an unexpected field",
            {
                repository_hints: ["full-chaos/platform"],
                schema_version: "device_approval_preview_response.v1",
                unbounded_scope: true,
            },
        ],
    ])(
        "Given %s, when previewing, then rejects the malformed response contract",
        async (_name, response) => {
            installOpsAuthorization();
            server.use(
                http.post("https://acr.example.test/api/v1/oauth/device_approval", () =>
                    HttpResponse.json(response),
                ),
            );

            await expect(
                previewDeviceAuthorization({
                    signal: new AbortController().signal,
                    userCode: "ABCD2345",
                }),
            ).rejects.toMatchObject({ code: "malformed_response" });
        },
    );

    it.each([
        ["an empty selection", []],
        ["a repository-name wildcard", ["full-chaos/*"]],
        ["a wildcard mixed with an exact scope", ["*", "full-chaos/platform"]],
        ["unsorted exact scopes", ["full-chaos/zeta", "full-chaos/alpha"]],
        ["duplicate exact scopes", ["full-chaos/platform", "full-chaos/platform"]],
        ["an uppercase exact scope", ["Full-Chaos/platform"]],
        [
            "more than 100 exact scopes",
            Array.from(
                { length: 101 },
                (_, index) => `full-chaos/repository-${String(index).padStart(3, "0")}`,
            ),
        ],
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
                    signal: new AbortController().signal,
                    userCode: "ABCD2345",
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(approvals).toBe(0);
        },
    );

    it("Given an organization without the ACR entitlement, when approving, then denies before ACR credential issuance", async () => {
        let approvals = 0;
        let repositoryCatalogRequests = 0;
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                HttpResponse.json({
                    features: { agent_context_runtime: false },
                    is_valid: true,
                }),
            ),
            http.post("http://ops.example.test/graphql", () => {
                repositoryCatalogRequests += 1;
                return HttpResponse.json({ data: { catalog: { values: [] } } });
            }),
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
                repositoryScopes: ["*"],
                signal: new AbortController().signal,
                userCode: "ABCD2345",
            }),
        ).rejects.toMatchObject({ code: "not_entitled", status: 403 });
        expect(repositoryCatalogRequests).toBe(0);
        expect(approvals).toBe(0);
    });

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
