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

    it("normalizes upstream errors and never returns unknown upstream fields", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        schema_version: "dev_error.v1",
                        code: "rate_limited",
                        safe_message: "Try later.",
                        retryable: true,
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
            retryable: true,
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
