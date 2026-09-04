import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, backendUrlMock } = vi.hoisted(() => ({
    authMock: vi.fn(),
    backendUrlMock: vi.fn(() => "https://ops.example.test"),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: backendUrlMock }));

import { proxyDevRequest } from "./_proxy";

function request(body?: string, origin = "https://app.example.test"): Request {
    return new Request("https://app.example.test/api/v1/dev/conversations", {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json", origin },
        body,
    });
}

describe("Ask Dev same-origin proxy", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        authMock.mockResolvedValue({ access_token: "server-only-token" });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("requires an authenticated server session without contacting Ops", async () => {
        authMock.mockResolvedValue(null);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await proxyDevRequest(request(), "/api/v1/dev/conversations");

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ schema_version: "dev_web_error.v1" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a mutation without an exact same-origin header before reading the session", async () => {
        const response = await proxyDevRequest(
            request("{}", "https://evil.example.test"),
            "/api/v1/dev/conversations",
            { mutation: true },
        );

        expect(response.status).toBe(403);
        expect(authMock).not.toHaveBeenCalled();
    });

    // Regression coverage for a real defect found by CHAOS-3287's Playwright
    // coverage: with no AUTH_URL/NEXTAUTH_URL configured (the normal state
    // for local `pnpm dev` and this repo's own e2e-default CI job),
    // `expectedOrigin()` used to derive the expected origin from
    // `request.url`, which Next.js's dev server does not reliably set to
    // the actual `--hostname` it was started with. That rejected every
    // legitimate same-origin mutation unconditionally. The fix derives the
    // expected origin from the request's own inbound Host header instead.
    it("accepts a same-origin mutation derived from the Host header when AUTH_URL is unset", async () => {
        vi.stubEnv("AUTH_URL", "");
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                Response.json({ schema_version: "dev_conversation.v1" }, { status: 201 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const incoming = new Request("http://localhost:3001/api/v1/dev/conversations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "http://127.0.0.1:3001",
                host: "127.0.0.1:3001",
            },
            body: "{}",
        });

        const response = await proxyDevRequest(incoming, "/api/v1/dev/conversations", {
            mutation: true,
        });

        expect(response.status).toBe(201);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // AUTH_URL/NEXTAUTH_URL, when configured, must stay authoritative — the
    // Host/X-Forwarded-Host derivation is the FALLBACK for when neither is
    // set, never a competing source. A reverse proxy or load balancer can
    // rewrite Host in ways that must not silently override an explicitly
    // configured canonical origin.
    it("prefers a configured AUTH_URL over a mismatched Host header", async () => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                Response.json({ schema_version: "dev_conversation.v1" }, { status: 201 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const incoming = new Request("https://app.example.test/api/v1/dev/conversations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "https://app.example.test",
                // A Host header that, if it were consulted, would compute a
                // different expected origin than AUTH_URL — proving AUTH_URL
                // wins rather than merely "also happening to agree".
                host: "internal-lb.example.test:8080",
            },
            body: "{}",
        });

        const response = await proxyDevRequest(incoming, "/api/v1/dev/conversations", {
            mutation: true,
        });

        expect(response.status).toBe(201);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still rejects a cross-origin mutation when AUTH_URL is unset", async () => {
        vi.stubEnv("AUTH_URL", "");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const incoming = new Request("http://localhost:3001/api/v1/dev/conversations", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "https://evil.example.test",
                host: "127.0.0.1:3001",
            },
            body: "{}",
        });

        const response = await proxyDevRequest(incoming, "/api/v1/dev/conversations", {
            mutation: true,
        });

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards only the server session bearer, body, abort signal, and no-store response", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                Response.json({ schema_version: "dev_conversation.v1" }, { status: 201 }),
            );
        vi.stubGlobal("fetch", fetchMock);
        const incoming = request('{"title":"Runtime"}');

        const response = await proxyDevRequest(incoming, "/api/v1/dev/conversations", {
            mutation: true,
        });

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
        expect(url.toString()).toBe("https://ops.example.test/api/v1/dev/conversations");
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer server-only-token");
        expect(init.signal).toBe(incoming.signal);
        expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"title":"Runtime"}');
    });

    it("rejects an oversized request before contacting Ops", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const response = await proxyDevRequest(
            request(JSON.stringify({ value: "x".repeat(128) })),
            "/api/v1/dev/conversations",
            { mutation: true, requestLimit: 32 },
        );

        expect(response.status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an upstream path that can replace the configured Ops origin", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await proxyDevRequest(
            request(),
            "//attacker.example.test/api/v1/dev/conversations",
        );

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("normalizes upstream errors and never returns unknown upstream fields", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        schema_version: "dev_error.v1",
                        code: "rate_limited",
                        safe_message: "Try later.",
                        retryable: false,
                        limit_reset_at: "2026-08-01T00:00:00Z",
                        provider_secret: "must-not-leak",
                    },
                    { status: 429, headers: { "Retry-After": "30" } },
                ),
            ),
        );

        const response = await proxyDevRequest(request(), "/api/v1/dev/conversations");

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("30");
        expect(await response.json()).toEqual({
            schema_version: "dev_web_error.v1",
            code: "rate_limited",
            safe_message: "Try later.",
            retryable: false,
            limit_reset_at: "2026-08-01T00:00:00Z",
        });
    });

    it("passes through only a real event stream", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response("event: done\ndata: {}\n\n", {
                    headers: { "Content-Type": "text/event-stream" },
                }),
            ),
        );

        const response = await proxyDevRequest(request("{}"), "/api/v1/dev/messages", {
            mutation: true,
            stream: true,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
});
