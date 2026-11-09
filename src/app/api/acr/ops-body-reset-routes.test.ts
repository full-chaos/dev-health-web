import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// The real routes over the real service and Ops reads; Ops is a loopback server on real undici
// that answers 200 JSON headers and then resets the socket during the body.
let server: Server | undefined;

const JSON_HEAD = { "Content-Type": "application/json" };

async function ops(resets: (path: string) => boolean): Promise<void> {
    server = createServer((request, response) => {
        const path = request.url ?? "";
        request.resume();
        if (path.includes("impersonate/status")) {
            response.writeHead(200, JSON_HEAD).end(JSON.stringify({ is_impersonating: false }));
        } else if (resets(path)) {
            response.writeHead(200, JSON_HEAD);
            response.write('{"fea');
            setTimeout(() => response.socket?.resetAndDestroy(), 50);
        } else {
            response
                .writeHead(200, JSON_HEAD)
                .end(JSON.stringify({ features: { agent_context_runtime: true }, is_valid: true }));
        }
    });
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const { port } = listening.address() as AddressInfo;
    vi.stubEnv("BACKEND_URL", `http://127.0.0.1:${port}`);
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

describe("ACR routes: an Ops connection reset during a body read", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        authMock.mockResolvedValue({
            access_token: "ops-session-token",
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: "user-123", org_id: "org-123" },
        });
        checkRateLimitMock.mockResolvedValue({ limited: false, retryAfter: 0 });
        getClientIpMock.mockReturnValue("127.0.0.1");
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
        const running = server;
        server = undefined;
        if (running === undefined) return;
        running.closeAllConnections();
        await new Promise<void>((resolve) => running.close(() => resolve()));
    });

    it("Given the entitlement read, then POST /api/acr/device answers the stable 503 unavailable", async () => {
        await ops((path) => path.includes("entitlements"));
        expect(await answer(await devicePOST(deviceApproval()))).toBe(UNAVAILABLE);
    });

    it.each(["entitlements", "graphql"] as const)(
        "Given the %s read, then POST /api/agent-context/context-packets answers the stable 503 unavailable",
        async (read) => {
            await ops((path) => path.includes(read));
            expect(await answer(await contextPacketsPOST(contextPacket()))).toBe(UNAVAILABLE);
        },
    );
});
