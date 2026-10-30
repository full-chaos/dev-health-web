import { generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import result from "@/lib/ask-dev/__tests__/captures/context_fabric_investigation_result.v1.json";
import { shouldProxyToOps } from "@/lib/proxyRouting";
import { GET } from "./route";

const server = setupServer();
const temporaryPaths: string[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;

const OPS = "http://ops.example.test";
const ACR = "https://acr.example.test";
const RESULT_ID = "res_0a1b2c3d4e5f";

function configure(): void {
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const directory = mkdtempSync(join(tmpdir(), "ask-dev-replay-key-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", OPS);
}

function signedIn(extra: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: "ops-session-token",
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123", ...extra },
    } as Awaited<ReturnType<typeof auth>>);
}

type OpsCalls = { entitlement: number; scopes: number };

function installOps(
    features: Record<string, boolean>,
    scopes: readonly string[] = ["full-chaos/dev-health"],
): OpsCalls {
    const calls: OpsCalls = { entitlement: 0, scopes: 0 };
    server.use(
        http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () => {
            calls.entitlement += 1;
            return HttpResponse.json({ features, is_valid: true });
        }),
        http.post(`${OPS}/graphql`, () => {
            calls.scopes += 1;
            return HttpResponse.json({
                data: {
                    catalog: {
                        __typename: "CatalogResult",
                        values: scopes.map((value) => ({
                            __typename: "CatalogValueItem",
                            count: 1,
                            value,
                        })),
                    },
                },
            });
        }),
    );
    return calls;
}

const ENTITLED = { agent_context_runtime: true, ask_dev: true };

function errorV1(code: string, status: number): object {
    return {
        error: { code, http_status: status, message: "redacted", retryable: status >= 500 },
        request_id: "acr_req_0001",
        schema_version: "error.v1",
    };
}

function decodeAssertion(assertion: string): Record<string, unknown> {
    const [header, payload, signature] = assertion.split(".");
    if (header === undefined || payload === undefined || signature === undefined) {
        throw new Error("assertion needs three parts");
    }
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

function replay(id: string = RESULT_ID): Promise<Response> {
    return GET(
        new Request(`http://web.example.test/api/ask-dev/investigations/${encodeURIComponent(id)}`),
        { params: Promise.resolve({ resultId: id }) },
    );
}

type Seen = { assertions: string[]; methods: string[]; urls: string[] };

function installAcr(respond: () => Response = () => HttpResponse.json(result)): Seen {
    const seen: Seen = { assertions: [], methods: [], urls: [] };
    server.use(
        http.all(`${ACR}/api/v1/context-fabric/investigations*`, ({ request }) => {
            seen.methods.push(request.method);
            seen.urls.push(new URL(request.url).pathname);
            seen.assertions.push(request.headers.get("x-acr-web-assertion") ?? "");
            return respond();
        }),
    );
    return seen;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    configure();
    signedIn();
});
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("GET /api/ask-dev/investigations/{resultId}", () => {
    it("replays the stored result with one GET, a signed context:read assertion and no POST", async () => {
        installOps(ENTITLED);
        const seen = installAcr();

        const response = await replay();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual(result);
        // Zero POST: a replay never starts a run.
        expect(seen.methods).toEqual(["GET"]);
        expect(seen.urls).toEqual([`/api/v1/context-fabric/investigations/${RESULT_ID}`]);
        const claims = decodeAssertion(seen.assertions[0]!);
        expect(claims).toMatchObject({ method: "GET", sub: "user-123" });
        expect(JSON.stringify(claims)).toContain("context:read");
        expect(JSON.stringify(claims)).toContain("full-chaos/dev-health");
    });

    it("re-checks session, both entitlements, scopes and the assertion on EVERY call (check 18)", async () => {
        const ops = installOps(ENTITLED);
        const seen = installAcr();

        await replay();
        await replay();

        expect(ops).toEqual({ entitlement: 2, scopes: 2 });
        expect(vi.mocked(auth)).toHaveBeenCalledTimes(2);
        expect(seen.assertions).toHaveLength(2);
        expect(seen.assertions[0]).not.toBe(seen.assertions[1]);
    });

    it("denies the next call once ask_dev is revoked, with no ACR call", async () => {
        installOps(ENTITLED);
        const seen = installAcr();
        expect((await replay()).status).toBe(200);

        server.resetHandlers();
        installOps({ agent_context_runtime: true, ask_dev: false });
        const seen2 = installAcr();
        const denied = await replay();

        expect(denied.status).toBe(403);
        expect((await denied.json()).error.code).toBe("not_entitled");
        expect(seen.methods).toHaveLength(1);
        expect(seen2.methods).toHaveLength(0);
    });

    it("answers 401 without a session and reads nothing", async () => {
        vi.mocked(auth).mockResolvedValue(null as Awaited<ReturnType<typeof auth>>);
        const ops = installOps(ENTITLED);
        const seen = installAcr();

        const response = await replay();

        expect(response.status).toBe(401);
        expect(ops).toEqual({ entitlement: 0, scopes: 0 });
        expect(seen.methods).toHaveLength(0);
    });

    it("answers another principal's or org's result with ACR's 404 and leaks nothing", async () => {
        installOps(ENTITLED);
        const seen = installAcr(() =>
            HttpResponse.json(errorV1("not_found", 404), { status: 404 }),
        );

        const response = await replay("res_someone_elses");

        expect(response.status).toBe(404);
        const body = (await response.json()) as { error: { code: string }; request_id: string };
        expect(body.error.code).toBe("repository_not_available");
        expect(body.request_id).toBe(response.headers.get("x-request-id"));
        expect(JSON.stringify(body)).not.toContain("res_someone_elses");
        expect(seen.methods).toEqual(["GET"]);
    });

    it.each(["short", "has space in it", "a/b/c/d/e/f/g/h", "x".repeat(257)])(
        "answers a malformed id %j like an unknown one, before any session read",
        async (id) => {
            const ops = installOps(ENTITLED);
            const seen = installAcr();

            const response = await replay(id);

            expect(response.status).toBe(404);
            expect(ops).toEqual({ entitlement: 0, scopes: 0 });
            expect(seen.methods).toHaveLength(0);
            expect(vi.mocked(auth)).not.toHaveBeenCalled();
        },
    );

    it("does not return an upstream body that is not a result", async () => {
        installOps(ENTITLED);
        installAcr(() => HttpResponse.json({ hello: "world" }));

        const response = await replay();

        expect(response.status).not.toBe(200);
        expect(JSON.stringify(await response.json())).not.toContain("hello");
    });

    it("maps an ACR 503 with Retry-After to a retryable answer carrying the hint", async () => {
        installOps(ENTITLED);
        installAcr(() =>
            HttpResponse.json(errorV1("upstream_unavailable", 503), {
                headers: { "Retry-After": "7" },
                status: 503,
            }),
        );

        const response = await replay();

        expect(response.status).toBe(503);
        expect(response.headers.get("retry-after")).toBe("7");
    });

    it("replays during impersonation, since a replay starts no run (D-16)", async () => {
        signedIn({ real_org_id: "org-admin" });
        installOps(ENTITLED);
        installAcr();

        expect((await replay()).status).toBe(200);
    });
});

describe("INV-8: the replay path stays with its Next handler", () => {
    it.each([`/api/ask-dev/investigations/${RESULT_ID}`])("does not rewrite %s to Ops", (path) => {
        expect(shouldProxyToOps(path)).toBe(false);
    });
});
