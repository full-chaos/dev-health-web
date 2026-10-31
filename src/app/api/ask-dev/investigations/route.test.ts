import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import request from "@/lib/ask-dev/__tests__/captures/context_fabric_investigation_request.v1.json";
import { POST } from "./route";

const server = setupServer();
const temporaryPaths: string[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;

const OPS = "http://ops.example.test";
const ACR = "https://acr.example.test";
const SUBMISSION = "3f0c2a3e-8c1d-4b8e-9a53-0d5f2f9a1b11";
const THREAD = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

function writeSigningKey(): string {
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const directory = mkdtempSync(join(tmpdir(), "ask-dev-route-key-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    return keyFile;
}

function configure(): void {
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", writeSigningKey());
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

const sse = (text: string): Response =>
    new HttpResponse(text, { headers: { "Content-Type": "text/event-stream" } });

function post(body: unknown = request, headers: Record<string, string> = {}): Promise<Response> {
    return POST(
        new Request("http://web.example.test/api/ask-dev/investigations", {
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json",
                Origin: "http://web.example.test",
                ...headers,
            },
            method: "POST",
        }),
    );
}

async function readAll(response: Response): Promise<string> {
    return await response.text();
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

describe("POST /api/ask-dev/investigations — before the stream opens", () => {
    async function expectDenied(
        response: Response,
        status: number,
        code: string,
    ): Promise<Record<string, unknown>> {
        expect(response.status).toBe(status);
        expect(response.headers.get("content-type")).toContain("application/json");
        const body = (await response.json()) as {
            error: { code: string };
            request_id: string;
        };
        expect(body.error.code).toBe(code);
        // The id in the body is the id on the response header: one id to find the log line.
        expect(body.request_id).toBe(response.headers.get("x-request-id"));
        expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/u);
        return body as unknown as Record<string, unknown>;
    }

    it.each([
        ["a different origin", { Origin: "https://evil.example.test" }],
        ["an origin that is not a URL", { Origin: "null" }],
    ])(
        "refuses a cross-site POST with %s, before any session, ops or ACR call",
        async (_name, headers) => {
            const calls = installOps(ENTITLED);

            await expectDenied(await post(request, headers), 403, "origin_refused");
            expect(calls).toEqual({ entitlement: 0, scopes: 0 });
            expect(vi.mocked(auth)).not.toHaveBeenCalled();
        },
    );

    it("refuses a POST with no Origin header", async () => {
        installOps(ENTITLED);

        const response = await POST(
            new Request("http://web.example.test/api/ask-dev/investigations", {
                body: JSON.stringify(request),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            }),
        );

        await expectDenied(response, 403, "origin_refused");
    });

    it("expects AUTH_URL's origin behind a proxy", async () => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        installOps(ENTITLED);

        await expectDenied(await post(), 403, "origin_refused");
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                sse("event: result\ndata: {}\n\n"),
            ),
        );
        expect((await post(request, { Origin: "https://app.example.test" })).status).toBe(200);
    });

    it("denies a request with no session, and calls neither ops nor ACR", async () => {
        vi.mocked(auth).mockResolvedValue(null);
        const calls = installOps(ENTITLED);

        await expectDenied(await post(), 401, "unauthenticated");
        expect(calls).toEqual({ entitlement: 0, scopes: 0 });
    });

    it("blocks a new run while impersonating, before any ops or ACR call", async () => {
        signedIn({ real_org_id: "org-real" });
        const calls = installOps(ENTITLED);

        await expectDenied(await post(), 403, "not_entitled");
        expect(calls).toEqual({ entitlement: 0, scopes: 0 });
    });

    it.each([
        ["ask_dev off", { agent_context_runtime: true, ask_dev: false }],
        ["ask_dev missing", { agent_context_runtime: true }],
        ["agent_context_runtime off", { agent_context_runtime: false, ask_dev: true }],
        ["both off", { agent_context_runtime: false, ask_dev: false }],
    ])("denies when %s", async (_name, features) => {
        installOps(features);

        await expectDenied(await post(), 403, "not_entitled");
    });

    it("reads the entitlement again on every call, so a revoked entitlement denies the next run", async () => {
        const calls = installOps(ENTITLED);
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                sse("event: result\ndata: {}\n\n"),
            ),
        );

        expect((await post()).status).toBe(200);
        server.use(
            http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () =>
                HttpResponse.json({ features: { ...ENTITLED, ask_dev: false }, is_valid: true }),
            ),
        );
        await expectDenied(await post(), 403, "not_entitled");
        expect(calls.entitlement).toBe(1);
    });

    it("answers an empty repository list with the connect-a-repository state, not a stream", async () => {
        installOps(ENTITLED, []);

        const body = await expectDenied(await post(), 409, "no_repository");
        expect(JSON.stringify(body)).toContain("Connect a repository");
    });

    it("rejects a body that fails the pinned request schema, and an id that is not a UUID", async () => {
        installOps(ENTITLED);

        await expectDenied(await post({ question: "no schema_version" }), 400, "invalid_request");
        await expectDenied(
            await post(request, { "X-ACR-Submission-ID": "not-a-uuid" }),
            400,
            "invalid_request",
        );
    });
});

describe("POST /api/ask-dev/investigations — the submission id", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

    function recordSubmissionIds(): (string | null)[] {
        const seen: (string | null)[] = [];
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, ({ request: upstream }) => {
                seen.push(upstream.headers.get("x-acr-submission-id"));
                return sse('event: accepted\ndata: {"seq":1}\n\n');
            }),
        );
        return seen;
    }

    it("mints a submission id when the browser sends none, so ACR's shared limits always count the run", async () => {
        installOps(ENTITLED);
        const seen = recordSubmissionIds();

        await readAll(await post());
        await readAll(await post());
        expect(seen).toHaveLength(2);
        for (const id of seen) expect(id).toMatch(UUID);
        expect(new Set(seen).size).toBe(2);
    });

    it("keeps a client-supplied id unchanged", async () => {
        installOps(ENTITLED);
        const seen = recordSubmissionIds();

        await readAll(await post(request, { "X-ACR-Submission-ID": SUBMISSION }));

        expect(seen).toEqual([SUBMISSION]);
    });

    it.each([
        ["not a UUID", "not-a-uuid"],
        ["present but empty", ""],
    ])(
        "still refuses a client-supplied id that is %s, and does not replace it with a minted one",
        async (_name, value) => {
            installOps(ENTITLED);
            const seen = recordSubmissionIds();

            const response = await post(request, { "X-ACR-Submission-ID": value });

            expect(response.status).toBe(400);
            expect(seen).toEqual([]);
        },
    );
});

describe("POST /api/ask-dev/investigations — the stream", () => {
    it("writes a keepalive as the first bytes, relays ACR's events unchanged, and signs one assertion for the exact body", async () => {
        installOps(ENTITLED);
        let seenBody = "";
        let seenRequestId: string | null = null;
        let seenHeaders: Record<string, string | null> = {};
        let assertion: Record<string, unknown> = {};
        server.use(
            http.post(
                `${ACR}/api/v1/context-fabric/investigations`,
                async ({ request: upstream }) => {
                    seenBody = await upstream.text();
                    seenRequestId = upstream.headers.get("x-request-id");
                    seenHeaders = {
                        accept: upstream.headers.get("accept"),
                        authorization: upstream.headers.get("authorization"),
                        submission: upstream.headers.get("x-acr-submission-id"),
                        thread: upstream.headers.get("x-acr-thread-id"),
                    };
                    assertion = decodeAssertion(upstream.headers.get("x-acr-web-assertion") ?? "");
                    return sse(
                        'event: accepted\ndata: {"seq":1}\n\nevent: result\ndata: {"seq":2}\n\n',
                    );
                },
            ),
        );

        const response = await post(request, {
            "X-ACR-Submission-ID": SUBMISSION,
            "X-ACR-Thread-ID": THREAD,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
        expect(response.headers.get("x-accel-buffering")).toBe("no");
        const text = await readAll(response);
        expect(text.startsWith(": keepalive\n\n")).toBe(true);
        expect(text).toContain('event: accepted\ndata: {"seq":1}\n\n');
        expect(text).toContain('event: result\ndata: {"seq":2}\n\n');
        expect(seenHeaders).toEqual({
            accept: "text/event-stream",
            authorization: null,
            submission: SUBMISSION,
            thread: THREAD,
        });
        expect(seenRequestId).toBe(response.headers.get("x-request-id"));
        expect(assertion).toMatchObject({
            body_sha256: createHash("sha256").update(seenBody).digest("base64url"),
            method: "POST",
            org_id: "org-123",
            path: "/api/v1/context-fabric/investigations",
            permissions: ["context:read"],
            repository_scopes: ["full-chaos/dev-health"],
            sub: "user-123",
        });
    });

    it("sends each call its own assertion", async () => {
        installOps(ENTITLED);
        const ids: unknown[] = [];
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, ({ request: upstream }) => {
                ids.push(decodeAssertion(upstream.headers.get("x-acr-web-assertion") ?? "").jti);
                return sse("event: result\ndata: {}\n\n");
            }),
        );

        await readAll(await post());
        await readAll(await post());

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });

    it("ends the stream with an error frame that carries retry_after_seconds when ACR refuses with 429", async () => {
        installOps(ENTITLED);
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                HttpResponse.json(errorV1("rate_limited", 429), {
                    headers: { "Retry-After": "7" },
                    status: 429,
                }),
            ),
        );

        const response = await post();
        const text = await readAll(response);

        expect(response.status).toBe(200);
        const frame = /event: error\ndata: (.+)\n\n/u.exec(text);
        expect(frame, text).not.toBeNull();
        // codex r2 on #1639: ACR's rate limit has its own code and words, never an outage.
        expect(JSON.parse(frame![1]!)).toMatchObject({
            code: "ask_dev_rate_limited",
            message: "Too many questions in a short time. Wait a moment, then ask again.",
            request_id: response.headers.get("x-request-id"),
            retry_after_seconds: 7,
            retryable: true,
            source: "web",
        });
    });

    it("passes Retry-After on a 503 too, not only on a 429", async () => {
        installOps(ENTITLED);
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                HttpResponse.json(errorV1("upstream_unavailable", 503), {
                    headers: { "Retry-After": "30" },
                    status: 503,
                }),
            ),
        );

        const text = await readAll(await post());

        expect(text).toContain('"retry_after_seconds":30');
    });

    it("accepts a case-variant event-stream media type and refuses a look-alike", async () => {
        installOps(ENTITLED);
        server.use(
            http.post(
                `${ACR}/api/v1/context-fabric/investigations`,
                () =>
                    new HttpResponse("event: result\ndata: {}\n\n", {
                        headers: { "Content-Type": "Text/Event-Stream; charset=utf-8" },
                    }),
            ),
        );
        expect(await readAll(await post())).toContain("event: result");

        server.use(
            http.post(
                `${ACR}/api/v1/context-fabric/investigations`,
                () =>
                    new HttpResponse("event: result\ndata: {}\n\n", {
                        headers: { "Content-Type": "text/event-streams" },
                    }),
            ),
        );
        const text = await readAll(await post());
        expect(text).toContain('"code":"invalid_upstream"');
        expect(text).not.toContain("event: result");
    });

    it("names a 406 from ACR stream_unavailable and does not fall back to JSON", async () => {
        installOps(ENTITLED);
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                HttpResponse.json(errorV1("invalid_request", 406), { status: 406 }),
            ),
        );

        const text = await readAll(await post());

        expect(text).toContain('"code":"stream_unavailable"');
        expect(text).not.toContain("event: result");
        // codex r1 on #1639: the words match the code, never "temporarily unavailable".
        expect(text).toContain("Ask Dev answers are turned off here right now.");
        expect(text).not.toContain("temporarily");
    });

    it.each(["stream_unavailable", "internal_error"])(
        "says the stream is off for a 406 with %s, whatever the body's code",
        async (wireCode) => {
            installOps(ENTITLED);
            server.use(
                http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                    HttpResponse.json(errorV1(wireCode, 406), { status: 406 }),
                ),
            );
            const text = await readAll(await post());
            expect(text).toContain('"code":"stream_unavailable"');
            expect(text).toContain("Ask Dev answers are turned off here right now.");
        },
    );

    it("treats a 200 JSON answer as an invalid upstream, never as a result", async () => {
        installOps(ENTITLED);
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, () =>
                HttpResponse.json({ schema_version: "context_fabric_investigation_response.v1" }),
            ),
        );

        const text = await readAll(await post());

        expect(text).toContain('"code":"invalid_upstream"');
        expect(text).not.toContain("event: result");
    });

    it("aborts ACR when the browser cancels the stream", async () => {
        installOps(ENTITLED);
        let upstreamCancelled = false;
        server.use(
            http.post(`${ACR}/api/v1/context-fabric/investigations`, ({ request: upstream }) => {
                const encoder = new TextEncoder();
                upstream.signal.addEventListener("abort", () => {
                    upstreamCancelled = true;
                });
                return new HttpResponse(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(
                                encoder.encode('event: accepted\ndata: {"seq":1}\n\n'),
                            );
                        },
                    }),
                    { headers: { "Content-Type": "text/event-stream" } },
                );
            }),
        );

        const response = await post();
        const reader = response.body!.getReader();
        await reader.read();
        await reader.read();
        await reader.cancel();
        await vi.waitFor(() => expect(upstreamCancelled).toBe(true));
    });
});
