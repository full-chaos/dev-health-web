import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkRateLimitMock, decideOAuthConsentMock, getClientIpMock, previewOAuthConsentMock } =
    vi.hoisted(() => ({
        checkRateLimitMock: vi.fn(),
        decideOAuthConsentMock: vi.fn(),
        getClientIpMock: vi.fn(),
        previewOAuthConsentMock: vi.fn(),
    }));

vi.mock("@/lib/acr/service", () => ({
    decideOAuthConsent: decideOAuthConsentMock,
    previewOAuthConsent: previewOAuthConsentMock,
}));
vi.mock("@/lib/client-ip", () => ({
    getClientIp: getClientIpMock,
    isTrustProxyEnabled: () => false,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { POST } from "./route";

const HANDLE = "A".repeat(43);

function request(origin = "https://app.example.test", customBody: unknown = undefined): Request {
    return new Request("https://app.example.test/api/acr/authorize", {
        body: JSON.stringify(
            customBody ?? { action: "approve", handle: HANDLE, repository_scopes: ["*"] },
        ),
        headers: { "content-type": "application/json", origin },
        method: "POST",
    });
}

describe("POST /api/acr/authorize", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        checkRateLimitMock.mockResolvedValue({ limited: false, retryAfter: 0 });
        getClientIpMock.mockReturnValue("127.0.0.1");
        decideOAuthConsentMock.mockResolvedValue({
            redirectUrl: "http://localhost:53141/callback?code=abc&state=xyz&iss=acr",
        });
        previewOAuthConsentMock.mockResolvedValue({
            clientKind: "dynamic",
            clientName: "Claude Code",
            clientSelfAsserted: true,
            expiresAt: "2026-09-22T12:40:00Z",
            redirectOrigin: "http://localhost:53141",
            resource: "https://mcp.fullchaos.dev/mcp",
            scopes: ["context:read", "evidence:read"],
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("Given a same-origin approve request, when within both limits, then approves and passes the redirect_url through unchanged", async () => {
        const response = await POST(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            redirectUrl: "http://localhost:53141/callback?code=abc&state=xyz&iss=acr",
        });
        expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
        expect(decideOAuthConsentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "approve",
                handle: HANDLE,
                repositoryScopes: ["*"],
            }),
        );
    });

    it("Given a preview request, when within both limits, then previews", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "preview", handle: HANDLE }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.clientName).toBe("Claude Code");
        expect(previewOAuthConsentMock).toHaveBeenCalledWith(
            expect.objectContaining({ handle: HANDLE }),
        );
    });

    it("Given a deny request, when within both limits, then denies without a repository grant", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "deny", handle: HANDLE }),
        );

        expect(response.status).toBe(200);
        expect(decideOAuthConsentMock).toHaveBeenCalledWith(
            expect.objectContaining({ action: "deny", handle: HANDLE }),
        );
        expect(decideOAuthConsentMock.mock.calls[0][0]).not.toHaveProperty("repositoryScopes");
    });

    it("Given an approve request with no repository_scopes, when posting, then rejects before deciding", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "approve", handle: HANDLE }),
        );

        expect(response.status).toBe(400);
        expect(decideOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given an unsupported action, when posting, then rejects before either ACR operation", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "grant", handle: HANDLE }),
        );

        expect(response.status).toBe(400);
        expect(decideOAuthConsentMock).not.toHaveBeenCalled();
        expect(previewOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given the service rejects the handle shape, when posting, then preserves the 400 status", async () => {
        previewOAuthConsentMock.mockRejectedValue(
            new AcrRuntimeError(
                acrRuntimeErrorCodes.invalidRequest,
                "The authorization request is invalid.",
                { status: 400 },
            ),
        );

        const response = await POST(
            request("https://app.example.test", { action: "preview", handle: "not-a-handle" }),
        );

        expect(response.status).toBe(400);
        expect(previewOAuthConsentMock).toHaveBeenCalledWith(
            expect.objectContaining({ handle: "not-a-handle" }),
        );
    });

    it("Given an empty handle, when posting, then rejects before either ACR operation", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "preview", handle: "" }),
        );

        expect(response.status).toBe(400);
        expect(previewOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given a cross-origin request, when posting, then rejects before either ACR operation", async () => {
        const response = await POST(request("https://evil.example.test"));

        expect(response.status).toBe(403);
        expect(decideOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given a rate-limited client, when posting, then rejects before either ACR operation", async () => {
        checkRateLimitMock.mockResolvedValueOnce({ limited: true, retryAfter: 30 });

        const response = await POST(request());

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("30");
        expect(decideOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given a rate-limited handle, when posting, then rejects before either ACR operation", async () => {
        checkRateLimitMock
            .mockResolvedValueOnce({ limited: false, retryAfter: 0 })
            .mockResolvedValueOnce({ limited: true, retryAfter: 60 });

        const response = await POST(request());

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(decideOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("Given ACR reports the handle expired, when posting, then preserves the 410 status", async () => {
        decideOAuthConsentMock.mockRejectedValue(
            new AcrRuntimeError(acrRuntimeErrorCodes.expired, "This request has expired.", {
                status: 410,
            }),
        );

        const response = await POST(request());

        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({
            error: {
                code: "expired",
                message: "This request has expired.",
                retryable: false,
            },
        });
    });

    it("Given an unexpected error, when posting, then returns a generic 503 without leaking the cause", async () => {
        decideOAuthConsentMock.mockRejectedValue(new Error("boom"));

        const response = await POST(request());

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: { code: "unavailable", message: "Approval is temporarily unavailable." },
        });
    });
});
