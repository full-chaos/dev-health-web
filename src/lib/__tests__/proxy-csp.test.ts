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
});
