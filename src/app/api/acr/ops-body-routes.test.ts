import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const { authMock, checkRateLimitMock, getClientIpMock } = vi.hoisted(() => ({
    authMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    getClientIpMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/client-ip", () => ({ getClientIpFromEnv: getClientIpMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

import { POST as contextPacketsPOST } from "../agent-context/context-packets/route";
import { POST as devicePOST } from "./device/route";

// The real routes over the real service and Ops reads (msw plays Ops): an Ops body that is not
// UTF-8 gets the same route answer, byte for byte, as an Ops body that is not JSON.
const server = setupServer();
const NOT_UTF8 = () =>
    new HttpResponse(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), {
        headers: { "Content-Type": "application/json" },
    });
const NOT_JSON = () =>
    new HttpResponse("not json", { headers: { "Content-Type": "application/json" } });
const ENTITLED = () =>
    HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true });

function ops(read: "entitlement" | "catalog", respond: () => Response): void {
    server.use(
        http.get("http://ops.example.test/api/v1/admin/impersonate/status", () =>
            HttpResponse.json({ is_impersonating: false }),
        ),
        http.get(
            "http://ops.example.test/api/v1/licensing/entitlements/:orgId",
            read === "entitlement" ? respond : ENTITLED,
        ),
        http.post("http://ops.example.test/graphql", respond),
    );
}

async function answer(response: Response): Promise<string> {
    return JSON.stringify({ body: await response.text(), status: response.status });
}

function deviceApproval(): Request {
    return new Request("https://app.example.test/api/acr/device", {
        body: JSON.stringify({
            action: "approve",
            repository_scopes: ["*"],
            user_code: "ABCD2345",
        }),
        headers: { "content-type": "application/json", origin: "https://app.example.test" },
        method: "POST",
    });
}

function contextPacket(): Request {
    return new Request("https://app.example.test/api/agent-context/context-packets", {
        body: JSON.stringify({ goal: "Verify", repository: "full-chaos/dev-health-acr" }),
        headers: { "content-type": "application/json" },
        method: "POST",
    });
}

const UNAVAILABLE = JSON.stringify({
    body: JSON.stringify({
        error: {
            code: "unavailable",
            message: "Agent Context Runtime is temporarily unavailable.",
            retryable: true,
        },
    }),
    status: 503,
});

describe("ACR routes: an Ops body that is not UTF-8", () => {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
    afterAll(() => server.close());
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        vi.stubEnv("BACKEND_URL", "http://ops.example.test");
        authMock.mockResolvedValue({
            access_token: "ops-session-token",
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: "user-123", org_id: "org-123" },
        });
        checkRateLimitMock.mockResolvedValue({ limited: false, retryAfter: 0 });
        getClientIpMock.mockReturnValue("127.0.0.1");
    });
    afterEach(() => {
        server.resetHandlers();
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("Given the entitlement read, then POST /api/acr/device answers as for a non-JSON body", async () => {
        ops("entitlement", NOT_JSON);
        const notJson = await answer(await devicePOST(deviceApproval()));
        ops("entitlement", NOT_UTF8);
        const notUtf8 = await answer(await devicePOST(deviceApproval()));
        expect(notUtf8).toBe(notJson);
        expect(notUtf8).toBe(UNAVAILABLE);
    });

    it.each(["entitlement", "catalog"] as const)(
        "Given the %s read, then POST /api/agent-context/context-packets answers as for a non-JSON body",
        async (read) => {
            ops(read, NOT_JSON);
            const notJson = await answer(await contextPacketsPOST(contextPacket()));
            ops(read, NOT_UTF8);
            const notUtf8 = await answer(await contextPacketsPOST(contextPacket()));
            expect(notUtf8).toBe(notJson);
            expect(notUtf8).toBe(UNAVAILABLE);
        },
    );
});
