import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/origin", () => ({
    getBackendUrl: vi.fn(() => "http://localhost:8000"),
}));

vi.mock("@/lib/logger", () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
        })),
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(): NextRequest {
    return new NextRequest("http://localhost:3000/");
}

beforeEach(() => {
    vi.unstubAllEnvs();
});

describe("proxy Content-Security-Policy", () => {
    it("allows React development eval when browser test mode is enabled", async () => {
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "true");

        const response = await proxy(request());

        expect(response.headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
    });

    it("does not allow eval when browser test mode is disabled", async () => {
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");

        const response = await proxy(request());

        expect(response.headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
    });

    it("allows React development eval on the development server", async () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");

        const response = await proxy(request());

        expect(response.headers.get("Content-Security-Policy")).toMatch(
            /script-src 'self' 'nonce-[A-Za-z0-9_-]+' 'unsafe-eval';/,
        );
    });

    it("never allows eval in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");

        const response = await proxy(request());
        const csp = response.headers.get("Content-Security-Policy");

        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9_-]+';/);
    });

    it("never allows eval in production, even when browser test mode is set", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "true");

        const response = await proxy(request());

        expect(response.headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
    });
});
