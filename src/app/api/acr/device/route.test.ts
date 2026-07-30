import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    approveDeviceAuthorizationMock,
    authMock,
    checkRateLimitMock,
    getClientIpMock,
    previewDeviceAuthorizationMock,
} = vi.hoisted(() => ({
    approveDeviceAuthorizationMock: vi.fn(),
    authMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    getClientIpMock: vi.fn(),
    previewDeviceAuthorizationMock: vi.fn(),
}));

vi.mock("@/lib/acr/service", () => ({
    approveDeviceAuthorization: approveDeviceAuthorizationMock,
    previewDeviceAuthorization: previewDeviceAuthorizationMock,
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/client-ip", () => ({
    getClientIp: getClientIpMock,
    isTrustProxyEnabled: () => false,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { POST } from "./route";

const body = {
    action: "approve",
    repository_scopes: ["*"],
    repository_hints: ["full-chaos/platform"],
    user_code: "ABCD2345",
};

function request(origin = "https://app.example.test", customBody: unknown = body): Request {
    return new Request("https://app.example.test/api/acr/device", {
        body: JSON.stringify(customBody),
        headers: { "content-type": "application/json", origin },
        method: "POST",
    });
}

describe("POST /api/acr/device", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-123", org_id: "org-123" },
        });
        checkRateLimitMock.mockResolvedValue({ limited: false, retryAfter: 0 });
        getClientIpMock.mockReturnValue("127.0.0.1");
        approveDeviceAuthorizationMock.mockResolvedValue({ status: "approved" });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("Given a same-origin authenticated request, when it is within both limits, then approves", async () => {
        const response = await POST(request());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "approved" });
        expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
        expect(approveDeviceAuthorizationMock).toHaveBeenCalledWith(
            expect.objectContaining({
                repositoryScopes: ["*"],
                userCode: "ABCD2345",
            }),
        );
    });

    it("Given a preview request, when it is within both limits, then previews", async () => {
        previewDeviceAuthorizationMock.mockResolvedValue({
            repositoryHints: ["full-chaos/platform"],
        });

        const response = await POST(
            request("https://app.example.test", { action: "preview", user_code: "ABCD2345" }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ repositoryHints: ["full-chaos/platform"] });
        expect(checkRateLimitMock).toHaveBeenCalledTimes(2);
        expect(previewDeviceAuthorizationMock).toHaveBeenCalledWith(
            expect.objectContaining({
                userCode: "ABCD2345",
            }),
        );
    });

    it("Given an unsupported action, when posting, then rejects before either approval operation", async () => {
        const response = await POST(
            request("https://app.example.test", { action: "grant", user_code: "ABCD2345" }),
        );

        expect(response.status).toBe(400);
        expect(approveDeviceAuthorizationMock).not.toHaveBeenCalled();
        expect(previewDeviceAuthorizationMock).not.toHaveBeenCalled();
    });

    it("Given a cross-origin request, when posting, then rejects before approval", async () => {
        const response = await POST(request("https://evil.example.test"));

        expect(response.status).toBe(403);
        expect(approveDeviceAuthorizationMock).not.toHaveBeenCalled();
    });

    it("Given a limited user-code attempt, when posting, then rejects before approval", async () => {
        checkRateLimitMock
            .mockResolvedValueOnce({ limited: false, retryAfter: 0 })
            .mockResolvedValueOnce({ limited: true, retryAfter: 60 });

        const response = await POST(request());

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(approveDeviceAuthorizationMock).not.toHaveBeenCalled();
    });

    it("Given ACR rejects an approval conflict, when posting, then preserves the 409 status", async () => {
        approveDeviceAuthorizationMock.mockRejectedValue(
            new AcrRuntimeError(acrRuntimeErrorCodes.upstream, "redacted upstream conflict", {
                status: 409,
            }),
        );

        const response = await POST(request());

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: {
                code: "upstream",
                message: "Agent Context Runtime is temporarily unavailable.",
                retryable: false,
            },
        });
    });
});
