import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { z } from "zod";

// allow: SIZE_OK — cohesive ACR runtime boundary integration matrix shares one signed-assertion fixture.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import contextPacket from "../contracts/examples/context_packet.v1.json";
import expandedEvidence from "../contracts/examples/expanded_evidence.v1.json";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "../errors";
import { createContextPacket, getExpandedEvidence, listAuthorizedRepositories } from "../service";

const server = setupServer();
const temporaryPaths: string[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;

const capabilities = {
    enabled_tools: ["context_for_task", "source_evidence"],
    entitlements: { agent_context_runtime: true },
    generated_at: "2026-07-15T00:00:00Z",
    limits: {
        max_items: 50,
        max_output_tokens: 16_000,
        max_serialized_bytes: 1_048_576,
        requests_per_minute: 120,
    },
    minimum_sidecar_version: "1.0.0",
    permissions: { context_read: true, episode_write: false, evidence_read: true },
    schema_version: "capabilities.v1",
    service: "dev-health-acr",
    service_version: "1.0.0",
    supported_schema_versions: [
        "context_packet.v1",
        "context_packet_request.v1",
        "expanded_evidence.v1",
    ],
};

const webAssertionPayloadSchema = z.object({
    body_sha256: z.string(),
    method: z.enum(["GET", "POST"]),
    org_id: z.string(),
    path: z.string(),
    permissions: z.array(z.enum(["context:read", "evidence:read"])),
    repository_scopes: z.array(z.string()),
    sub: z.string(),
});

function encodeError(status: number): object {
    return {
        error: {
            code: "upstream_unavailable",
            http_status: status,
            message: "redacted upstream detail",
            retryable: status >= 500,
        },
        request_id: "req_01234567",
        schema_version: "error.v1",
    };
}

function writeSigningKey(mode = 0o600): string {
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const directory = mkdtempSync(join(tmpdir(), "acr-service-key-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, mode);
    return keyFile;
}

function configure(keyFile: string, timeoutMs = "5000"): void {
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", timeoutMs);
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", "http://ops.example.test");
}

function configureAuthenticatedSession(): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: "ops-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123" },
    });
}

function installOpsAuthorization(
    scopes = ["full-chaos/dev-health-acr"],
    agentContextRuntime = true,
    onEntitlement: () => void = () => undefined,
): void {
    server.use(
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", ({ request }) => {
            onEntitlement();
            expect(request.headers.get("authorization")).toBe("Bearer ops-session-token");
            expect(request.headers.get("cache-control")).toBe("no-store");
            return HttpResponse.json({
                features: { agent_context_runtime: agentContextRuntime },
                is_valid: true,
            });
        }),
        http.post("http://ops.example.test/graphql", async ({ request }) => {
            const body = await request.json();
            const operation = z
                .object({
                    query: z.string(),
                    variables: z.object({ orgId: z.string() }).strict(),
                })
                .strict()
                .parse(body);
            expect(operation.query).toContain("query ACRRepositoryScopes($orgId: String!)");
            expect(operation.query).toContain("catalog(orgId: $orgId, dimension: REPO)");
            expect(operation.variables).toEqual({ orgId: "org-123" });
            return HttpResponse.json({
                data: { catalog: { values: scopes.map((value) => ({ count: 1, value })) } },
            });
        }),
    );
}

function decodeWebAssertion(assertion: string): z.infer<typeof webAssertionPayloadSchema> {
    const parts = assertion.split(".");
    const payload = parts[1];
    const signature = parts[2];
    if (payload === undefined || signature === undefined)
        throw new Error("missing web assertion parts");
    expect(
        verify(
            null,
            Buffer.from(`${parts[0]}.${payload}`),
            publicKey,
            Buffer.from(signature, "base64url"),
        ),
    ).toBe(true);
    return webAssertionPayloadSchema.parse(
        JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
}

function installAcrHappyResponses(includeDebug = false): void {
    server.use(
        http.get("https://acr.example.test/api/v1/agent-context/capabilities", ({ request }) => {
            const assertion = request.headers.get("x-acr-web-assertion");
            expect(request.headers.get("authorization")).toBeNull();
            expect(request.headers.get("x-acr-client-version")).toBe("0.1.0");
            expect(assertion).not.toBeNull();
            if (assertion === null) return HttpResponse.json(encodeError(401), { status: 401 });
            const payload = decodeWebAssertion(assertion);
            expect(payload).toMatchObject({
                body_sha256: createHash("sha256").update("").digest("base64url"),
                method: "GET",
                path: "/api/v1/agent-context/capabilities",
                permissions: ["context:read", "evidence:read"],
                repository_scopes: ["full-chaos/dev-health-acr"],
            });
            const evidenceRead = payload.permissions.includes("evidence:read");
            return HttpResponse.json({
                ...capabilities,
                enabled_tools: evidenceRead ? capabilities.enabled_tools : ["context_for_task"],
                permissions: { ...capabilities.permissions, evidence_read: evidenceRead },
            });
        }),
        http.post(
            "https://acr.example.test/api/v1/agent-context/context-packets",
            async ({ request }) => {
                const body = await request.text();
                const assertion = request.headers.get("x-acr-web-assertion");
                expect(assertion).not.toBeNull();
                if (assertion === null) return HttpResponse.json(encodeError(401), { status: 401 });
                const payload = decodeWebAssertion(assertion);
                expect(payload).toMatchObject({
                    body_sha256: createHash("sha256").update(body).digest("base64url"),
                    method: "POST",
                    path: "/api/v1/agent-context/context-packets",
                    permissions: ["context:read"],
                    repository_scopes: ["full-chaos/dev-health-acr"],
                });
                const packetRequest = z
                    .object({
                        options: z.object({ include_debug: z.literal(includeDebug) }).loose(),
                        repository: z
                            .object({ slug: z.literal("full-chaos/dev-health-acr") })
                            .strict(),
                        scope: z.object({ commit_sha: z.string(), task_ref: z.string() }).strict(),
                    })
                    .loose()
                    .parse(JSON.parse(body));
                expect(packetRequest.scope.commit_sha).toBe("abcdef1");
                return HttpResponse.json(contextPacket);
            },
        ),
        http.get(
            "https://acr.example.test/api/v1/agent-context/evidence/:evidenceRefId",
            ({ request }) => {
                const assertion = request.headers.get("x-acr-web-assertion");
                expect(assertion).not.toBeNull();
                if (assertion === null) return HttpResponse.json(encodeError(401), { status: 401 });
                expect(decodeWebAssertion(assertion)).toMatchObject({
                    method: "GET",
                    path: "/api/v1/agent-context/evidence/evidence-123",
                    permissions: ["evidence:read"],
                });
                return HttpResponse.json(expandedEvidence);
            },
        ),
    );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
    configure(writeSigningKey());
    configureAuthenticatedSession();
});

afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

describe("ACR server-only runtime service", () => {
    it("resolves server-scoped authorization and sends a request-bound context assertion", async () => {
        installOpsAuthorization();
        installAcrHappyResponses();

        const packet = await createContextPacket({
            body: {
                branchOrCommit: "abcdef1",
                goal: "Verify the server-only boundary",
                repository: "full-chaos/dev-health-acr",
                taskReference: "CHAOS-2911",
            },
            signal: new AbortController().signal,
        });

        expect(packet).toEqual(contextPacket);
    });

    it("expands evidence only through the narrowed evidence route capability", async () => {
        installOpsAuthorization();
        installAcrHappyResponses();

        const evidence = await getExpandedEvidence({
            evidenceRefId: "evidence-123",
            repository: "full-chaos/dev-health-acr",
            signal: new AbortController().signal,
        });

        expect(evidence).toEqual(expandedEvidence);
    });

    it.each([" evidence-123 ", `${"e".repeat(255)}😀`])(
        "preserves opaque evidence ID %s byte-for-byte in the BFF-to-ACR path",
        async (evidenceRefId) => {
            installOpsAuthorization();
            installAcrHappyResponses();
            const expectedPath = `/api/v1/agent-context/evidence/${encodeURIComponent(evidenceRefId)}`;
            let requestPath: string | undefined;
            server.use(
                http.get(
                    "https://acr.example.test/api/v1/agent-context/evidence/:evidenceRefId",
                    ({ request }) => {
                        requestPath = new URL(request.url).pathname;
                        const assertion = request.headers.get("x-acr-web-assertion");
                        expect(assertion).not.toBeNull();
                        if (assertion === null)
                            return HttpResponse.json(encodeError(401), { status: 401 });
                        expect(decodeWebAssertion(assertion)).toMatchObject({
                            method: "GET",
                            path: expectedPath,
                            permissions: ["evidence:read"],
                        });
                        return HttpResponse.json(expandedEvidence);
                    },
                ),
            );

            await expect(
                getExpandedEvidence({
                    evidenceRefId,
                    repository: "full-chaos/dev-health-acr",
                    signal: new AbortController().signal,
                }),
            ).resolves.toEqual(expandedEvidence);

            expect(requestPath).toBe(expectedPath);
        },
    );

    it("fails closed when the organization entitlement is false", async () => {
        server.use(
            http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                HttpResponse.json({ features: { agent_context_runtime: false }, is_valid: true }),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.notEntitled, status: 403 });
    });

    it.each([
        ["missing", { features: { agent_context_runtime: true } }],
        ["false", { features: { agent_context_runtime: true }, is_valid: false }],
        ["malformed", { features: { agent_context_runtime: true }, is_valid: "true" }],
    ])(
        "fails closed before scope or ACR requests when is_valid is %s",
        async (_name, entitlement) => {
            let acrRequests = 0;
            let scopeRequests = 0;
            server.use(
                http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
                    HttpResponse.json(entitlement),
                ),
                http.post("http://ops.example.test/graphql", () => {
                    scopeRequests += 1;
                    return HttpResponse.json({ data: { catalog: { values: [] } } });
                }),
                http.all("https://acr.example.test/*", () => {
                    acrRequests += 1;
                    return HttpResponse.json(capabilities);
                }),
            );

            await expect(
                createContextPacket({
                    body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                    signal: new AbortController().signal,
                }),
            ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.notEntitled, status: 403 });
            expect(scopeRequests).toBe(0);
            expect(acrRequests).toBe(0);
        },
    );

    it("rejects a foreign repository selector before contacting ACR", async () => {
        installOpsAuthorization(["full-chaos/other-repository"]);
        let acrRequests = 0;
        server.use(
            http.all("https://acr.example.test/*", () => {
                acrRequests += 1;
                return HttpResponse.json(capabilities);
            }),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.repositoryNotAvailable, status: 404 });
        expect(acrRequests).toBe(0);
    });

    it("rejects unsorted or duplicate repository membership returned by Ops", async () => {
        installOpsAuthorization(["full-chaos/dev-health-acr", "full-chaos/dev-health-acr"]);

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.unavailable });
    });

    it("returns an empty authorized repository catalog without treating it as unavailable", async () => {
        installOpsAuthorization([]);

        await expect(listAuthorizedRepositories("org-123")).resolves.toEqual([]);
    });

    it("keeps platform validation usable without granting the customer agent runtime", async () => {
        let entitlementRequests = 0;
        vi.mocked(auth).mockResolvedValue({
            access_token: "ops-session-token",
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: "user-123", is_superuser: true, org_id: "org-123" },
        });
        installOpsAuthorization(["full-chaos/dev-health-acr"], false, () => {
            entitlementRequests += 1;
        });
        installAcrHappyResponses(true);

        await expect(
            createContextPacket({
                body: {
                    branchOrCommit: "abcdef1",
                    goal: "Validate Context Fabric independently",
                    repository: "full-chaos/dev-health-acr",
                    taskReference: "CHAOS-3216",
                },
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual(contextPacket);
        expect(entitlementRequests).toBe(0);
    });

    it("fails closed on an ACR contract version drift before forwarding a packet", async () => {
        installOpsAuthorization();
        server.use(
            http.get("https://acr.example.test/api/v1/agent-context/capabilities", () =>
                HttpResponse.json({
                    ...capabilities,
                    supported_schema_versions: ["context_packet.v1", "context_packet_request.v1"],
                }),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.incompatible, status: 426 });
    });

    it.each([
        [401, acrRuntimeErrorCodes.unauthenticated],
        [403, acrRuntimeErrorCodes.upstream],
        [404, acrRuntimeErrorCodes.repositoryNotAvailable],
        [429, acrRuntimeErrorCodes.upstream],
        [500, acrRuntimeErrorCodes.upstream],
    ])("maps safe ACR failure %i without exposing the upstream body", async (status, code) => {
        installOpsAuthorization();
        server.use(
            http.get("https://acr.example.test/api/v1/agent-context/capabilities", () =>
                HttpResponse.json(capabilities),
            ),
            http.post("https://acr.example.test/api/v1/agent-context/context-packets", () =>
                HttpResponse.json(encodeError(status), { status }),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code, status });
    });

    it("rejects malformed and oversized ACR responses", async () => {
        installOpsAuthorization();
        server.use(
            http.get("https://acr.example.test/api/v1/agent-context/capabilities", () =>
                HttpResponse.json(capabilities),
            ),
            http.post(
                "https://acr.example.test/api/v1/agent-context/context-packets",
                () =>
                    new HttpResponse("{", {
                        headers: { "content-type": "application/json" },
                    }),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.malformedResponse });

        server.use(
            http.post(
                "https://acr.example.test/api/v1/agent-context/context-packets",
                () =>
                    new HttpResponse("{}", {
                        headers: {
                            "content-length": "1048577",
                            "content-type": "application/json",
                        },
                    }),
            ),
        );
        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.responseTooLarge });
    });

    it("rejects an ACR redirect rather than following it", async () => {
        installOpsAuthorization();
        server.use(
            http.get("https://acr.example.test/api/v1/agent-context/capabilities", () =>
                HttpResponse.redirect("https://attacker.example.test"),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.unavailable });
    });

    it("returns a typed timeout when ACR does not respond", async () => {
        configure(writeSigningKey(), "100");
        installOpsAuthorization();
        server.use(
            http.get(
                "https://acr.example.test/api/v1/agent-context/capabilities",
                () => new Promise<Response>(() => undefined),
            ),
        );

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.timeout, status: 504 });
    });

    it("keeps invalid private-key permissions outside the runtime request path", async () => {
        configure(writeSigningKey(0o640));
        installOpsAuthorization();

        await expect(
            createContextPacket({
                body: { goal: "verify", repository: "full-chaos/dev-health-acr" },
                signal: new AbortController().signal,
            }),
        ).rejects.toBeInstanceOf(AcrRuntimeError);
    });
});
